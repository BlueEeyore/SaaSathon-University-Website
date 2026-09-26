"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";

export function LectureProcessingStatus({ status }: { status: string }) {
  const router = useRouter();
  useEffect(() => {
    if (status === "failed" || status === "ready") return;
    const interval = window.setInterval(() => router.refresh(), 5000);
    return () => window.clearInterval(interval);
  }, [router, status]);

  const message = status === "normalizing"
    ? "Preparing the video for smooth playback…"
    : status === "transcribing"
      ? "Creating the transcript and captions…"
      : status === "uploaded"
        ? "The video is uploaded and waiting for transcription to begin."
        : status === "failed"
          ? "Processing could not be completed."
          : "Your lecture is being prepared…";

  return <div className="rounded-2xl border border-[#c5def3] bg-[#eaf3fb] p-6">
    <div className="flex items-center gap-3 text-[#1f70b7]">
      {status !== "failed" && <LoaderCircle className="size-5 animate-spin" />}
      <h2 className="font-semibold">{status === "failed" ? "Processing failed" : "Getting your lecture ready"}</h2>
    </div>
    <p className="mt-2 text-sm leading-6 text-[#526779]">{message}</p>
  </div>;
}
