"use client";

import { useCallback, useRef, useState } from "react";
import type { TranscriptSegment } from "@/lib/validation";
import { TranscriptDiscussion } from "@/components/transcript-discussion";
import { ScopedAiQuestions } from "@/components/scoped-ai-questions";
import type { lectureAiSourceSchema } from "@/lib/validation";
import type { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Highlight = { id: string; lecture_id: string; start_ms: number; end_ms: number; quote: string; user_id: string };
type Comment = { id: string; lecture_id: string; highlight_id: string | null; parent_id: string | null; author_id: string; body: string; created_at: string };
type AiQuestion = { id: string; lecture_id: string; highlight_id: string; user_id: string; question: string; answer: string; created_at: string };
type Person = { user_id: string; full_name: string; email: string };

export function LecturePlayer({
  lectureId,
  title,
  segments,
  language,
  highlights,
  comments,
  aiQuestions,
  scopeAiQuestions,
  classId,
  initialTimeMs,
  profiles,
}: {
  lectureId: string;
  title: string;
  segments: TranscriptSegment[];
  language: string;
  highlights: Highlight[];
  comments: Comment[];
  aiQuestions: AiQuestion[];
  scopeAiQuestions: { id: string; question: string; answer: string; sources: z.infer<typeof lectureAiSourceSchema>[]; created_at: string }[];
  classId: string;
  initialTimeMs?: number;
  profiles: Person[];
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [activeIndex, setActiveIndex] = useState(-1);

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

  return <div className="space-y-6">
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(260px,0.65fr)]">
      <div className="overflow-hidden rounded-2xl bg-black shadow-lg">
        <video
          ref={videoRef}
          className="aspect-video w-full"
          controls
          playsInline
          preload="metadata"
          onTimeUpdate={updateTranscript}
          aria-label={title}
          onLoadedMetadata={() => {
            if (initialTimeMs != null && videoRef.current) videoRef.current.currentTime = initialTimeMs / 1000;
          }}
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
          Select transcript text to highlight a passage and start a discussion. Click a timestamp to jump to that point in the video.
        </CardContent>
      </Card>
    </div>
    <TranscriptDiscussion
      lectureId={lectureId}
      segments={segments}
      highlights={highlights}
      comments={comments}
      aiQuestions={aiQuestions}
      profiles={profiles}
      activeIndex={activeIndex}
      onSeek={seekTo}
    />
    <ScopedAiQuestions scope="lecture" targetId={lectureId} classId={classId} questions={scopeAiQuestions} />
  </div>;
}
