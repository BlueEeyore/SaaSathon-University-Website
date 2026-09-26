import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sourceMediaPath, tempMediaPath } from "@/lib/media";
import {
  idSchema,
  LECTURE_UPLOAD_MAX_BYTES,
  LECTURE_UPLOAD_MAX_SECONDS,
  lectureSourceFormatSchema,
  lectureUploadTitleSchema,
  uploadPolicySchema,
} from "@/lib/validation";

export const runtime = "nodejs";

const policy = uploadPolicySchema.parse({
  maxBytes: LECTURE_UPLOAD_MAX_BYTES,
  maxSeconds: LECTURE_UPLOAD_MAX_SECONDS,
});
const formatMime: Record<string, string> = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};

class UploadTooLargeError extends Error {}
class InvalidVideoError extends Error {}
class UploadCancelledError extends Error {}

type ProbeResult = {
  format?: { duration?: string; format_name?: string };
  streams?: { codec_type?: string }[];
};

async function probeVideo(filePath: string, signal: AbortSignal): Promise<ProbeResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "ffprobe",
      [
        "-v", "error",
        "-show_entries", "format=duration,format_name:stream=codec_type",
        "-of", "json",
        filePath,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => child.kill("SIGKILL"), 30_000);
    const abortProbe = () => child.kill("SIGKILL");
    signal.addEventListener("abort", abortProbe, { once: true });
    if (signal.aborted) abortProbe();
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      stdout += chunk;
      if (stdout.length > 64_000) child.kill();
    });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      stderr += chunk;
      if (stderr.length > 8_000) stderr = stderr.slice(-8_000);
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", abortProbe);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", abortProbe);
      if (signal.aborted) {
        reject(new UploadCancelledError());
        return;
      }
      if (code !== 0) {
        reject(new InvalidVideoError(stderr.trim() || "This file could not be read as a video."));
        return;
      }
      try {
        resolve(JSON.parse(stdout) as ProbeResult);
      } catch {
        reject(new InvalidVideoError("Could not inspect this video file."));
      }
    });
  });
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ classId: string }> },
) {
  const { classId } = await params;
  if (!idSchema.safeParse(classId).success) return jsonError("Class not found.", 404);

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims.sub;
  if (!userId) return jsonError("Sign in to upload a lecture.", 401);

  const { data: membership } = await supabase
    .from("class_members")
    .select("role")
    .eq("class_id", classId)
    .eq("user_id", userId)
    .maybeSingle();
  if (membership?.role !== "lecturer") return jsonError("Lecturer access is required.", 403);

  const title = lectureUploadTitleSchema.safeParse(request.nextUrl.searchParams.get("title"));
  if (!title.success) return jsonError(title.error.issues[0]?.message ?? "Enter a lecture title.", 400);

  const format = lectureSourceFormatSchema.safeParse(request.headers.get("x-file-extension")?.toLowerCase());
  if (!format.success) return jsonError("Choose an MP4, MOV, or WebM video.", 415);
  const contentType = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (contentType && contentType !== formatMime[format.data] && contentType !== "application/octet-stream") {
    return jsonError("The file type does not match its video format.", 415);
  }
  if (!request.body) return jsonError("The upload did not include a file.", 400);

  const announcedLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(announcedLength) && announcedLength > policy.maxBytes) {
    return jsonError("Videos must be 2 GB or smaller.", 413);
  }

  const lectureId = randomUUID();
  const tempPath = tempMediaPath(`${lectureId}.upload`);
  const finalPath = sourceMediaPath(lectureId, format.data);
  let finalFileExists = false;
  let registered = false;
  try {
    await Promise.all([
      mkdir(path.dirname(tempPath), { recursive: true }),
      mkdir(path.dirname(finalPath), { recursive: true }),
    ]);

    let bytes = 0;
    const limiter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        bytes += chunk.length;
        if (bytes > policy.maxBytes) {
          callback(new UploadTooLargeError("Videos must be 2 GB or smaller."));
          return;
        }
        callback(null, chunk);
      },
    });
    await pipeline(
      Readable.fromWeb(request.body as unknown as import("node:stream/web").ReadableStream),
      limiter,
      createWriteStream(tempPath, { flags: "wx" }),
    );
    if (request.signal.aborted) throw new UploadCancelledError();
    if (bytes === 0) return jsonError("Choose a video file to upload.", 400);

    const probe = await probeVideo(tempPath, request.signal);
    if (request.signal.aborted) throw new UploadCancelledError();
    const formatName = probe.format?.format_name?.toLowerCase() ?? "";
    const containerMatches = format.data === "webm"
      ? formatName.includes("webm")
      : formatName.split(",").some((name) => ["mov", "mp4", "m4a", "3gp", "3g2", "mj2"].includes(name));
    if (!containerMatches) return jsonError("The file contents do not match an MP4, MOV, or WebM video.", 415);
    const streamTypes = new Set((probe.streams ?? []).map((stream) => stream.codec_type));
    if (!streamTypes.has("video") || !streamTypes.has("audio")) {
      return jsonError("The video must include both picture and audio.", 415);
    }
    const durationSeconds = Number(probe.format?.duration);
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      return jsonError("Could not determine this video's duration.", 400);
    }
    if (durationSeconds > policy.maxSeconds) {
      return jsonError("Videos must be 60 minutes or shorter.", 413);
    }

    await rename(tempPath, finalPath);
    finalFileExists = true;
    const sourceBytes = (await stat(finalPath)).size;
    if (request.signal.aborted) throw new UploadCancelledError();
    const { error } = await supabase.rpc("register_lecture_upload", {
      upload_id: lectureId,
      target_class: classId,
      lecture_title: title.data,
      lecture_description: "",
      file_format: format.data,
      file_bytes: sourceBytes,
      media_duration_ms: Math.round(durationSeconds * 1000),
    });
    if (error) throw new Error(error.message);
    registered = true;
    if (request.signal.aborted) throw new UploadCancelledError();

    return NextResponse.json({ lectureId, status: "uploaded" }, { status: 201 });
  } catch (error) {
    if (finalFileExists) await rm(finalPath, { force: true }).catch(() => undefined);
    if (registered) {
      const { data } = await supabase.rpc("cancel_lecture", { target_lecture: lectureId });
      if (data?.length) {
        await supabase.rpc("finalize_cancelled_lecture", { target_lecture: lectureId });
      }
    }
    if (request.signal.aborted || error instanceof UploadCancelledError) {
      return jsonError("The upload was cancelled.", 400);
    }
    if (error instanceof UploadTooLargeError) {
      return jsonError("Videos must be 2 GB or smaller.", 413);
    }
    if (error instanceof InvalidVideoError) {
      return jsonError("This file is not a valid MP4, MOV, or WebM video.", 415);
    }
    console.error("Lecture upload failed", error);
    return jsonError("The upload could not be completed. Please try again.", 500);
  } finally {
    await rm(tempPath, { force: true }).catch(() => undefined);
  }
}
