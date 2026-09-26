import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { getReadableLecture } from "@/lib/lecture-api";
import { captionMediaPath } from "@/lib/media";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ lectureId: string }> },
) {
  const { lectureId } = await params;
  const result = await getReadableLecture(lectureId);
  if (!result || result.lecture.status !== "ready") {
    return NextResponse.json({ error: "Lecture captions not found." }, { status: 404 });
  }
  try {
    const captions = await readFile(captionMediaPath(lectureId), "utf8");
    return new Response(captions, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": "text/vtt; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Lecture captions not found." }, { status: 404 });
  }
}
