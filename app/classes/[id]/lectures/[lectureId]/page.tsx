import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { BrandWordmark } from "@/components/brand-wordmark";
import { LecturePlayer } from "@/components/lecture-player";
import { LectureProcessingStatus } from "@/components/lecture-processing-status";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { signOut } from "@/app/login/actions";
import { requireUser } from "@/lib/auth";
import { isConfigured } from "@/lib/config";
import { idSchema, scopedAiSourcesSchema, transcriptSegmentsSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

function formatDuration(durationMs: number) {
  const seconds = Math.floor(durationMs / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default async function LecturePage({
  params, searchParams,
}: {
  params: Promise<{ id: string; lectureId: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  if (!isConfigured()) redirect("/login");
  const { id: classId, lectureId } = await params;
  const { t } = await searchParams;
  const parsedTime = t && /^\d{1,9}$/.test(t) ? Number(t) : undefined;
  if (!idSchema.safeParse(classId).success || !idSchema.safeParse(lectureId).success) notFound();

  const { supabase, email } = await requireUser();
  const [{ data: classItem }, { data: lecture }] = await Promise.all([
    supabase.from("classes").select("id, title").eq("id", classId).maybeSingle(),
    supabase.from("lectures").select("*").eq("id", lectureId).eq("class_id", classId).maybeSingle(),
  ]);
  if (!classItem || !lecture || lecture.status === "cancelled") notFound();
  const initialTimeMs = parsedTime != null && parsedTime <= lecture.duration_ms ? parsedTime : undefined;

  const { data: transcript } = lecture.status === "ready"
    ? await supabase.from("transcripts").select("language, segments").eq("lecture_id", lectureId).maybeSingle()
    : { data: null };
  const parsedSegments = transcriptSegmentsSchema.safeParse(transcript?.segments);
  const segments = parsedSegments.success ? parsedSegments.data : [];
  const [{ data: highlights }, { data: comments }, { data: aiQuestions }, { data: lectureAiRows }] = segments.length
    ? await Promise.all([
      supabase.from("transcript_highlights").select("id, lecture_id, start_ms, end_ms, quote, user_id").eq("lecture_id", lectureId).order("start_ms"),
      supabase.from("transcript_comments").select("id, lecture_id, highlight_id, parent_id, author_id, body, created_at").eq("lecture_id", lectureId).order("created_at"),
      supabase.from("transcript_ai_questions").select("id, lecture_id, highlight_id, user_id, question, answer, created_at").eq("lecture_id", lectureId).order("created_at", { ascending: false }),
      supabase.from("scope_ai_questions").select("id, question, answer, sources, created_at").eq("lecture_id", lectureId).eq("scope", "lecture").order("created_at", { ascending: false }),
    ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];
  const lectureAiQuestions = (lectureAiRows ?? []).flatMap((row) => {
    const sources = scopedAiSourcesSchema.safeParse(row.sources);
    return sources.success ? [{ ...row, sources: sources.data }] : [];
  });
  const profileIds = [...new Set([
    ...(comments ?? []).map((comment) => comment.author_id),
    ...(aiQuestions ?? []).map((question) => question.user_id),
  ])];
  const { data: profiles } = profileIds.length
    ? await supabase.from("profiles").select("user_id, full_name, email").in("user_id", profileIds)
    : { data: [] };

  return <div className="min-h-screen bg-[#f5f8fb]">
    <header className="sticky top-0 z-20 border-b border-black/[0.06] bg-white/90 backdrop-blur-xl">
      <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-5 sm:px-8">
        <Link href="/classes" className="flex items-center gap-2.5 font-semibold tracking-tight"><BrandWordmark /></Link>
        <div className="flex items-center gap-3"><span className="hidden text-sm text-muted-foreground sm:block">{email}</span><form action={signOut}><Button variant="ghost" size="sm" type="submit">Sign out</Button></form></div>
      </div>
    </header>
    <main className="mx-auto max-w-7xl px-5 pb-16 pt-8 sm:px-8">
      <Link href={`/classes/${classId}`} className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"><ArrowLeft className="size-4" />{classItem.title}</Link>
      <div className="mb-6 mt-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div><p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#1f70b7]">LECTURE · {formatDuration(lecture.duration_ms)}</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">{lecture.title}</h1></div>
        {lecture.status === "ready" && <span className="text-xs text-muted-foreground">Video, transcript, and captions are ready</span>}
      </div>
      {lecture.status === "ready" ? <LecturePlayer
        lectureId={lectureId}
        classId={classId}
        initialTimeMs={initialTimeMs}
        title={lecture.title}
        segments={segments}
        language={transcript?.language ?? "en"}
        highlights={highlights ?? []}
        comments={comments ?? []}
        aiQuestions={aiQuestions ?? []}
        scopeAiQuestions={lectureAiQuestions}
        profiles={profiles ?? []}
      /> : <div className="mx-auto max-w-2xl space-y-4">
        <LectureProcessingStatus status={lecture.status} />
        {lecture.status === "failed" && lecture.error_message && <Card><CardContent className="p-5 text-sm text-destructive">{lecture.error_message}</CardContent></Card>}
        <p className="text-center text-xs text-muted-foreground">You can leave this page. The lecture will appear as ready in its class when processing finishes.</p>
      </div>}
    </main>
  </div>;
}
