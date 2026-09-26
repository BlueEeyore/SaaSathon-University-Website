#!/usr/bin/env python3
"""Local transcription worker for lecture uploads.

Run from the repository root after installing requirements.txt. The worker
claims jobs through Supabase's service-role API and keeps media on local disk.
"""

from __future__ import annotations

import json
import os
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
MAX_ATTEMPTS = 3
POLL_SECONDS = 4
WORKER_ENV_KEYS = {
    "NEXT_PUBLIC_SUPABASE_URL",
    "WORKER_SUPABASE_SERVICE_ROLE_KEY",
    "MEDIA_ROOT",
    "TRANSCRIBER_MODEL",
}


def load_local_environment() -> None:
    """Read simple KEY=value entries without printing or exporting secrets."""
    env_path = ROOT / ".env.worker"
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if key not in WORKER_ENV_KEYS:
            continue
        value = value.strip()
        if value.startswith(("'", '"')) and value.endswith(("'", '"')):
            value = value[1:-1]
        os.environ.setdefault(key, value)


def api_request(method: str, resource: str, payload: Any | None = None) -> Any:
    base_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:55431").rstrip("/")
    service_key = os.environ.get("WORKER_SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not service_key:
        raise RuntimeError(
            "Set WORKER_SUPABASE_SERVICE_ROLE_KEY in .env.worker before starting the worker."
        )
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Accept": "application/json",
    }
    body = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    if resource.startswith("transcripts?on_conflict="):
        headers["Prefer"] = "resolution=merge-duplicates,return=minimal"
    request = urllib.request.Request(
        f"{base_url}/rest/v1/{resource}", data=body, method=method, headers=headers
    )
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            raw = response.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:1000]
        raise RuntimeError(f"Supabase returned HTTP {error.code}: {detail}") from error


def rpc(name: str, payload: dict[str, Any] | None = None) -> Any:
    return api_request("POST", f"rpc/{name}", payload or {})


def patch_row(table: str, query: str, payload: dict[str, Any]) -> None:
    api_request("PATCH", f"{table}?{query}", payload)


def run(command: list[str], *, timeout_seconds: int = 3 * 60 * 60) -> None:
    try:
        subprocess.run(command, check=True, timeout=timeout_seconds, capture_output=True, text=True)
    except subprocess.CalledProcessError as error:
        detail = (error.stderr or error.stdout or "").strip()[-1000:]
        raise RuntimeError(detail or f"{command[0]} exited with code {error.returncode}.") from error


def milliseconds(seconds: float | None) -> int | None:
    if seconds is None:
        return None
    return max(0, round(seconds * 1000))


def vtt_timestamp(value_ms: int) -> str:
    hours, remainder = divmod(value_ms, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    seconds, millis = divmod(remainder, 1000)
    return f"{hours:02}:{minutes:02}:{seconds:02}.{millis:03}"


def escape_vtt(text: str) -> str:
    return (text.replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace("-->", "→"))


def media_root() -> Path:
    configured = os.environ.get("MEDIA_ROOT", "./media").strip() or "./media"
    location = Path(configured)
    return (ROOT / location).resolve() if not location.is_absolute() else location.resolve()


def transcribe(job: dict[str, Any], model: Any) -> None:
    lecture_id = str(job["lecture_id"])
    query = urllib.parse.urlencode({"id": f"eq.{lecture_id}"})
    records = api_request("GET", f"lectures?{query}&select=id,class_id,title,source_format")
    if not records:
        raise RuntimeError("The lecture record no longer exists.")
    lecture = records[0]
    base = media_root()
    source = base / "source" / f"{lecture_id}.{lecture['source_format']}"
    output_dir = base / "video"
    captions_dir = base / "captions"
    temp_dir = base / "tmp"
    for directory in (output_dir, captions_dir, temp_dir):
        directory.mkdir(parents=True, exist_ok=True)
    normalized = output_dir / f"{lecture_id}.mp4"
    normalized_temp = temp_dir / f"{lecture_id}.processing.mp4"
    captions = captions_dir / f"{lecture_id}.vtt"
    captions_temp = temp_dir / f"{lecture_id}.processing.vtt"
    audio_temp = temp_dir / f"{lecture_id}.audio.wav"

    patch_row("lectures", query, {"status": "normalizing", "error_message": None})
    try:
        run([
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(source),
            "-vf", "scale=w='min(1280,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "26",
            "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", str(normalized_temp),
        ])
        normalized_temp.replace(normalized)
        patch_row("lectures", query, {"status": "transcribing"})
        run([
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(normalized),
            "-vn", "-ac", "1", "-ar", "16000", "-f", "wav", str(audio_temp),
        ])

        segments_iter, info = model.transcribe(
            str(audio_temp), word_timestamps=True, vad_filter=True
        )
        transcript_segments: list[dict[str, Any]] = []
        captions_lines = ["WEBVTT", ""]
        for segment in segments_iter:
            segment_start = milliseconds(segment.start) or 0
            segment_end = max(segment_start + 1, milliseconds(segment.end) or segment_start + 1)
            segment_text = segment.text.strip()
            words = []
            for word in segment.words or []:
                word_start = milliseconds(word.start)
                word_end = milliseconds(word.end)
                if word_start is None or word_end is None:
                    continue
                words.append({
                    "w": word.word,
                    "start_ms": word_start,
                    "end_ms": max(word_start + 1, word_end),
                })
            index = len(transcript_segments)
            transcript_segments.append({
                "index": index,
                "start_ms": segment_start,
                "end_ms": segment_end,
                "text": segment_text,
                "words": words,
            })
            captions_lines.extend([
                f"{vtt_timestamp(segment_start)} --> {vtt_timestamp(segment_end)}",
                escape_vtt(segment_text),
                "",
            ])

        if not transcript_segments:
            raise RuntimeError("No speech was detected in this recording.")
        captions_temp.write_text("\n".join(captions_lines), encoding="utf-8")
        captions_temp.replace(captions)
        full_text = " ".join(item["text"] for item in transcript_segments if item["text"])
        api_request("POST", "transcripts?on_conflict=lecture_id", {
            "lecture_id": lecture_id,
            "language": getattr(info, "language", None) or "en",
            "provider": "faster-whisper",
            "model": os.environ.get("TRANSCRIBER_MODEL", "base"),
            "text": full_text,
            "segments": transcript_segments,
        })
        patch_row("lectures", query, {"status": "ready", "error_message": None})
        job_query = urllib.parse.urlencode({"lecture_id": f"eq.{lecture_id}"})
        patch_row("transcription_jobs", job_query, {"status": "complete", "error": None})
        source.unlink(missing_ok=True)
    finally:
        for temporary in (normalized_temp, audio_temp, captions_temp):
            temporary.unlink(missing_ok=True)


def main() -> None:
    load_local_environment()
    service_key = os.environ.get("WORKER_SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not service_key or service_key.startswith("PASTE_"):
        raise SystemExit("Add the local service-role key to .env.worker before starting the worker.")
    from faster_whisper import WhisperModel

    model_name = os.environ.get("TRANSCRIBER_MODEL", "base").strip() or "base"
    media_root().mkdir(parents=True, exist_ok=True)
    print(f"Lecture transcription worker ready (model: {model_name}).", flush=True)
    model = None
    while True:
        try:
            jobs = rpc("claim_transcription_job")
            if not jobs:
                time.sleep(POLL_SECONDS)
                continue
            job = jobs[0]
            if model is None:
                model = WhisperModel(model_name, device="cpu", compute_type="int8", cpu_threads=4)
            lecture_id = str(job["lecture_id"])
            print(f"Processing lecture {lecture_id} (attempt {job['attempts']}/{MAX_ATTEMPTS}).", flush=True)
            try:
                transcribe(job, model)
                print(f"Lecture {lecture_id} is ready.", flush=True)
            except Exception as error:  # keep the worker alive for the next job
                message = str(error).strip()[:1000] or "Transcription failed."
                print(f"Lecture {lecture_id} failed: {message}", flush=True)
                query = urllib.parse.urlencode({"lecture_id": f"eq.{lecture_id}"})
                attempts = int(job.get("attempts", MAX_ATTEMPTS))
                final = attempts >= MAX_ATTEMPTS
                patch_row("transcription_jobs", query, {
                    "status": "failed" if final else "pending",
                    "error": "Transcription failed. Check the worker output for details." if final else message,
                })
                lecture_query = urllib.parse.urlencode({"id": f"eq.{lecture_id}"})
                patch_row("lectures", lecture_query, {
                    "status": "failed" if final else "uploaded",
                    "error_message": "Transcription failed. Check the worker output for details." if final else None,
                })
                if not final:
                    time.sleep(POLL_SECONDS)
        except KeyboardInterrupt:
            print("Stopping lecture transcription worker.", flush=True)
            return
        except Exception as error:
            print(f"Worker could not reach Supabase: {str(error)[:1000]}", flush=True)
            time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
