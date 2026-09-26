"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TranscriptSegment } from "@/lib/validation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function timestamp(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function LecturePlayer({
  lectureId,
  title,
  segments,
  language,
}: {
  lectureId: string;
  title: string;
  segments: TranscriptSegment[];
  language: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const activeSegment = useMemo(
    () => segments.find((segment) => segment.index === activeIndex),
    [activeIndex, segments],
  );
  useEffect(() => {
    if (activeIndex < 0) return;
    document.querySelector(`[data-segment-index="${activeIndex}"]`)?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  }, [activeIndex]);

  const updateTranscript = useCallback(() => {
    const current = (videoRef.current?.currentTime ?? 0) * 1000;
    const active = segments.find((segment) => current >= segment.start_ms && current < segment.end_ms);
    setActiveIndex((previous) => (previous === (active?.index ?? -1) ? previous : (active?.index ?? -1)));
  }, [segments]);

  function seekTo(milliseconds: number) {
    if (!videoRef.current) return;
    videoRef.current.currentTime = milliseconds / 1000;
    void videoRef.current.play();
  }

  return <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.85fr)]">
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl bg-black shadow-lg">
        <video
          ref={videoRef}
          className="aspect-video w-full"
          controls
          playsInline
          preload="metadata"
          onTimeUpdate={updateTranscript}
          aria-label={title}
        >
          <source src={`/api/lectures/${lectureId}/video`} type="video/mp4" />
          <track
            kind="captions"
            src={`/api/lectures/${lectureId}/captions`}
            srcLang={language || "en"}
            label="English"
            default
          />
          Your browser does not support HTML video.
        </video>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">About this lecture</CardTitle></CardHeader>
        <CardContent className="text-sm leading-6 text-muted-foreground">
          Select a transcript section to jump to that point in the video. Captions can be switched on from the video controls.
        </CardContent>
      </Card>
    </div>
    <Card className="flex min-h-[420px] flex-col xl:max-h-[calc(100vh-150px)]">
      <CardHeader className="border-b pb-4">
        <CardTitle className="text-base">Transcript</CardTitle>
        <p className="text-xs text-muted-foreground">Follow along and select a passage to seek.</p>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto px-0 pb-2">
        {segments.length ? <div className="divide-y divide-border">
          {segments.map((segment) => <button
            type="button"
            key={segment.index}
            data-segment-index={segment.index}
            onClick={() => seekTo(segment.start_ms)}
            aria-current={activeSegment?.index === segment.index ? "true" : undefined}
            className={`flex w-full gap-3 px-5 py-3 text-left transition-colors hover:bg-[#f5f8fb] ${activeSegment?.index === segment.index ? "bg-[#eaf3fb]" : ""}`}
          >
            <span className="mt-0.5 shrink-0 font-mono text-xs text-[#1f70b7]">{timestamp(segment.start_ms)}</span>
            <span className="text-sm leading-6">{segment.text}</span>
          </button>)}
        </div> : <p className="p-5 text-sm text-muted-foreground">The transcript is not available yet.</p>}
      </CardContent>
    </Card>
  </div>;
}
