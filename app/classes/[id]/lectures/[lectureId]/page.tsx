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
import { idSchema, transcriptSegmentsSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

function formatDuration(durationMs: number) {
  const seconds = Math.floor(durationMs / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default async function LecturePage({
  params,
}: {
  params: Promise<{ id: string; lectureId: string }>;
}) {
  if (!isConfigured()) redirect("/login");
  const { id: classId, lectureId } = await params;
  if (!idSchema.safeParse(classId).success || !idSchema.safeParse(lectureId).success) notFound();

  const { supabase, email } = await requireUser();
  const [{ data: classItem }, { data: lecture }] = await Promise.all([
    supabase.from("classes").select("id, title").eq("id", classId).maybeSingle(),
    supabase.from("lectures").select("*").eq("id", lectureId).eq("class_id", classId).maybeSingle(),
  ]);
  if (!classItem || !lecture || lecture.status === "cancelled") notFound();

  const { data: transcript } = lecture.status === "ready"
    ? await supabase.from("transcripts").select("language, segments").eq("lecture_id", lectureId).maybeSingle()
    : { data: null };
  const parsedSegments = transcriptSegmentsSchema.safeParse(transcript?.segments);
  const segments = parsedSegments.success ? parsedSegments.data : [];

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
        title={lecture.title}
        segments={segments}
        language={transcript?.language ?? "en"}
      /> : <div className="mx-auto max-w-2xl space-y-4">
        <LectureProcessingStatus status={lecture.status} />
        {lecture.status === "failed" && lecture.error_message && <Card><CardContent className="p-5 text-sm text-destructive">{lecture.error_message}</CardContent></Card>}
        <p className="text-center text-xs text-muted-foreground">You can leave this page. The lecture will appear as ready in its class when processing finishes.</p>
      </div>}
    </main>
  </div>;
}
