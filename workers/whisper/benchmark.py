#!/usr/bin/env python3
"""Benchmark faster-whisper on this machine to size the demo clip length.

Whisper throughput is essentially linear in audio duration, so a sample of
real speech is enough to extrapolate. Reports wall-clock time, realtime
factor and peak RSS, because "does it fit in memory" and "is it fast enough"
are the two questions that decide which model the demo can use.

Usage:
    python benchmark.py <audio.wav> [--model base] [--threads N]

Requires faster-whisper installed and the model downloadable on first run.
"""

from __future__ import annotations

import argparse
import os
import platform
import resource
import sys
import time


def peak_rss_mb() -> float:
    """Peak resident set size of this process, in MB.

    On Linux ru_maxrss is already in kilobytes; macOS reports bytes.
    """
    raw = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return raw / 1024 if sys.platform != "darwin" else raw / (1024 * 1024)


def audio_duration_seconds(path: str) -> float:
    import wave

    try:
        with wave.open(path, "rb") as handle:
            return handle.getnframes() / float(handle.getframerate())
    except (wave.Error, OSError):
        pass
    # Not plain PCM wav (compressed, or a different container): ask ffprobe.
    import subprocess

    out = subprocess.run(
        [
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "csv=p=0", path,
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    return float(out.stdout.strip())


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("audio", help="audio file to transcribe")
    parser.add_argument("--model", default="base")
    parser.add_argument("--threads", type=int, default=os.cpu_count() or 4)
    parser.add_argument("--language", default="en")
    args = parser.parse_args()

    if not os.path.exists(args.audio):
        print(f"No such file: {args.audio}", file=sys.stderr)
        return 1

    from faster_whisper import WhisperModel

    duration = audio_duration_seconds(args.audio)

    print("=== faster-whisper benchmark ===")
    print(f"python            {platform.python_version()}")
    print(f"platform          {platform.system()} {platform.machine()}")
    print(f"logical cpus      {os.cpu_count()}")
    print(f"threads used      {args.threads}")
    print(f"model             {args.model} (int8, cpu)")
    print(f"input             {args.audio}")
    print(f"audio duration    {duration:.1f}s ({duration/60:.1f} min)")
    print()

    load_start = time.perf_counter()
    model = WhisperModel(
        args.model, device="cpu", compute_type="int8", cpu_threads=args.threads
    )
    load_seconds = time.perf_counter() - load_start
    rss_after_load = peak_rss_mb()
    print(f"model load        {load_seconds:.1f}s")
    print(f"rss after load    {rss_after_load:.0f} MB")
    print()

    # word_timestamps=True is what the follow-along player and
    # jump-to-highlight features need, so benchmark the real configuration
    # rather than the faster segment-only path.
    transcribe_start = time.perf_counter()
    segments, info = model.transcribe(
        args.audio,
        language=args.language,
        word_timestamps=True,
        vad_filter=True,
        beam_size=1,
    )
    # faster-whisper is lazy: the work happens while iterating segments.
    collected = list(segments)
    transcribe_seconds = time.perf_counter() - transcribe_start
    rss_peak = peak_rss_mb()

    words = sum(len(getattr(s, "words", None) or []) for s in collected)
    with_words = sum(1 for s in collected if getattr(s, "words", None))
    text = " ".join(s.text.strip() for s in collected)

    realtime_factor = duration / transcribe_seconds if transcribe_seconds else 0.0

    print(f"transcribe        {transcribe_seconds:.1f}s")
    print(f"realtime factor   {realtime_factor:.1f}x  "
          f"(>1 means faster than real time)")
    print(f"peak rss          {rss_peak:.0f} MB")
    print(f"segments          {len(collected)}")
    print(f"segments w/ words {with_words}")
    print(f"words             {words}")
    print(f"detected language {info.language} (p={info.language_probability:.2f})")
    print()
    print("--- first 400 characters of output ---")
    print(text[:400])
    print()

    print("=== extrapolation to a 15 minute lecture (900s) ===")
    projected = 900 / realtime_factor if realtime_factor else 0
    print(f"estimated time    {projected/60:.1f} min")
    print()
    if projected > 1800:
        print("VERDICT: too slow to transcribe live. Pre-transcribe and seed.")
    elif projected > 300:
        print("VERDICT: too slow to transcribe live without a warning. "
              "Pre-transcribe and seed.")
    else:
        print("VERDICT: fast enough to transcribe on stage, but still "
              "pre-transcribe for safety.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
