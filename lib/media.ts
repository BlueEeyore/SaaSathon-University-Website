import "server-only";
import path from "node:path";

export function getMediaRoot() {
  const configured = process.env.MEDIA_ROOT?.trim() || "./media";
  return path.resolve(process.cwd(), configured);
}

export function sourceMediaPath(lectureId: string, format: string) {
  return path.join(getMediaRoot(), "source", `${lectureId}.${format}`);
}

export function normalizedMediaPath(lectureId: string) {
  return path.join(getMediaRoot(), "video", `${lectureId}.mp4`);
}

export function captionMediaPath(lectureId: string) {
  return path.join(getMediaRoot(), "captions", `${lectureId}.vtt`);
}

export function tempMediaPath(name: string) {
  return path.join(getMediaRoot(), "tmp", name);
}
