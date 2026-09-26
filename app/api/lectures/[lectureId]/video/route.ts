import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import { getReadableLecture } from "@/lib/lecture-api";
import { normalizedMediaPath } from "@/lib/media";

export const runtime = "nodejs";

function notFound() {
  return NextResponse.json({ error: "Lecture video not found." }, { status: 404 });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ lectureId: string }> },
) {
  const { lectureId } = await params;
  const result = await getReadableLecture(lectureId);
  if (!result || result.lecture.status !== "ready") return notFound();

  const filePath = normalizedMediaPath(lectureId);
  let fileInfo;
  try {
    fileInfo = await stat(filePath);
  } catch {
    return notFound();
  }
  if (!fileInfo.isFile()) return notFound();

  const range = request.headers.get("range");
  let start = 0;
  let end = fileInfo.size - 1;
  let status = 200;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) {
      return new NextResponse(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${fileInfo.size}` },
      });
    }
    if (match[1]) {
      start = Number(match[1]);
      end = match[2] ? Number(match[2]) : end;
    } else {
      const suffixLength = Number(match[2]);
      start = Math.max(fileInfo.size - suffixLength, 0);
    }
    if (start > end || start >= fileInfo.size || end < 0) {
      return new NextResponse(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${fileInfo.size}` },
      });
    }
    end = Math.min(end, fileInfo.size - 1);
    status = 206;
  }

  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "Content-Length": String(end - start + 1),
    "Content-Type": "video/mp4",
    "Content-Disposition": "inline",
    "X-Content-Type-Options": "nosniff",
  });
  if (status === 206) headers.set("Content-Range", `bytes ${start}-${end}/${fileInfo.size}`);
  const stream = createReadStream(filePath, { start, end });
  return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, { status, headers });
}
