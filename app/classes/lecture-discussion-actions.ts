"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { scopeQuestionSchema, transcriptQuestionSchema, transcriptReplySchema, transcriptSegmentsSchema, transcriptThreadSchema, type FormState, type TranscriptSegment } from "@/lib/validation";
import { answerFromTranscripts, rankTranscriptSources } from "@/lib/lecture-ai";

export async function createTranscriptThread(_: FormState, form: FormData): Promise<FormState> {
  const input = transcriptThreadSchema.safeParse({
    lectureId: form.get("lectureId"),
    startMs: Number(form.get("startMs")),
    endMs: Number(form.get("endMs")),
    quote: form.get("quote"),
    body: form.get("body"),
  });
  if (!input.success) return { error: input.error.issues[0]?.message ?? "Select a passage and add a comment." };

  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("create_transcript_thread", {
    target_lecture: input.data.lectureId,
    selection_start_ms: input.data.startMs,
    selection_end_ms: input.data.endMs,
    selection_quote: input.data.quote,
    first_comment: input.data.body,
  });
  if (error) return { error: "We couldn’t post that comment. Please try again." };

  revalidatePath("/classes/[id]/lectures/[lectureId]", "page");
  return { success: "Comment added to the discussion." };
}

export async function replyToTranscriptThread(_: FormState, form: FormData): Promise<FormState> {
  const input = transcriptReplySchema.safeParse({
    lectureId: form.get("lectureId"),
    parentId: form.get("parentId"),
    body: form.get("body"),
  });
  if (!input.success) return { error: input.error.issues[0]?.message ?? "Check your reply." };

  const { supabase, userId } = await requireUser();
  const { error } = await supabase.from("transcript_comments").insert({
    lecture_id: input.data.lectureId,
    parent_id: input.data.parentId,
    author_id: userId,
    body: input.data.body,
  });
  if (error) {
    console.error("Could not save transcript reply.", { code: error.code, message: error.message });
    return { error: "We couldn’t post your reply. Please try again." };
  }

  revalidatePath("/classes/[id]/lectures/[lectureId]", "page");
  return { success: "Reply added." };
}

export async function askAboutTranscript(_: FormState, form: FormData): Promise<FormState> {
  const input = transcriptQuestionSchema.safeParse({
    lectureId: form.get("lectureId"),
    startMs: Number(form.get("startMs")),
    endMs: Number(form.get("endMs")),
    question: form.get("question"),
  });
  if (!input.success) return { error: input.error.issues[0]?.message ?? "Check your question." };

  const { supabase } = await requireUser();
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { error: "AI questions aren’t configured yet. Add OPENAI_API_KEY to .env.local and restart the app." };

  const { data: transcript } = await supabase.from("transcripts")
    .select("segments")
    .eq("lecture_id", input.data.lectureId)
    .maybeSingle();
  if (!transcript) return { error: "The transcript passage is unavailable." };
  const parsed = transcriptSegmentsSchema.safeParse(transcript.segments);
  if (!parsed.success) return { error: "The transcript passage is unavailable." };

  const selectedSegments = parsed.data.filter((segment) =>
    segment.end_ms > input.data.startMs && segment.start_ms < input.data.endMs,
  );
  const selectedWords = selectedSegments.flatMap((segment) =>
    segment.words.filter((word) => word.end_ms > input.data.startMs && word.start_ms < input.data.endMs).map((word) => word.w),
  ).join("").trim();
  const selectedPassage = (selectedWords || selectedSegments.map((segment) => segment.text).join(" ")).trim().slice(0, 600);
  if (!selectedPassage) return { error: "The selected transcript passage is unavailable." };

  const relevant = parsed.data
    .filter((segment) => segment.end_ms >= input.data.startMs - 15000 && segment.start_ms <= input.data.endMs + 15000)
    .map((segment) => segment.text)
    .join(" ")
    .slice(0, 7000);
  const model = process.env.OPENAI_MODEL || "gpt-6-luna";
  let answer: string;
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        instructions: "You are a helpful teaching assistant. Answer the student's question using the lecture excerpt. Be accurate and concise. If the excerpt does not contain enough information, say so. Do not invent details. Use Markdown when useful. Put mathematical variables, subscripts, superscripts, and equations in LaTeX delimiters: $...$ inline or $$...$$ on a separate line. Write $V_1$, not raw notation such as (V_1). Keep your answer below 350 words.",
        input: `Selected passage (${Math.floor(input.data.startMs / 1000)}s):\n${selectedPassage}\n\nNearby lecture transcript:\n${relevant}\n\nStudent question:\n${input.data.question}`,
        reasoning: { effort: "low" },
        max_output_tokens: 500,
        store: false,
      }),
      signal: AbortSignal.timeout(45000),
    });
    if (!response.ok) {
      console.error("OpenAI Responses API returned status", response.status);
      return { error: "AI couldn’t answer right now. Please check the API setup and try again." };
    }
    const data: unknown = await response.json();
    const outputs = typeof data === "object" && data !== null && "output" in data && Array.isArray(data.output) ? data.output : [];
    answer = outputs.flatMap((item) => typeof item === "object" && item !== null && "content" in item && Array.isArray(item.content) ? item.content : [])
      .flatMap((item) => typeof item === "object" && item !== null && "text" in item && typeof item.text === "string" ? [item.text] : [])
      .join("\n\n").trim();
  } catch {
    return { error: "AI couldn’t be reached. Please try again." };
  }
  if (!answer || answer.length > 2700) return { error: "AI returned an empty or overly long answer. Please try again." };

  const { error } = await supabase.rpc("create_transcript_ai_question", {
    target_lecture: input.data.lectureId,
    selection_start_ms: input.data.startMs,
    selection_end_ms: input.data.endMs,
    selection_quote: selectedPassage,
    student_question: input.data.question,
    ai_answer: answer,
  });
  if (error) return { error: "AI answered, but the response could not be saved to the class Q&A." };
  revalidatePath("/classes/[id]/lectures/[lectureId]", "page");
  return { success: "AI answer added to class Q&A." };
}

export async function askAboutScope(_: FormState, form: FormData): Promise<FormState> {
  const input = scopeQuestionSchema.safeParse({
    scope: form.get("scope"),
    targetId: form.get("targetId"),
    question: form.get("question"),
  });
  if (!input.success) return { error: input.error.issues[0]?.message ?? "Check your question." };

  const { supabase } = await requireUser();
  let classId = input.data.targetId;
  let targetLecture: string | null = null;
  let transcripts: Array<{ lectureId: string; title: string; segments: TranscriptSegment[] }> = [];

  if (input.data.scope === "lecture") {
    const { data: lecture } = await supabase.from("lectures").select("id, class_id, title, status").eq("id", input.data.targetId).maybeSingle();
    if (!lecture || lecture.status !== "ready") return { error: "This lecture isn’t ready for questions yet." };
    classId = lecture.class_id;
    targetLecture = lecture.id;
    const { data: transcript } = await supabase.from("transcripts").select("segments").eq("lecture_id", lecture.id).maybeSingle();
    const parsed = transcriptSegmentsSchema.safeParse(transcript?.segments);
    if (!parsed.success || parsed.data.length === 0) return { error: "The lecture transcript isn’t available." };
    transcripts = [{ lectureId: lecture.id, title: lecture.title, segments: parsed.data }];
  } else {
    const { data: classItem } = await supabase.from("classes").select("id").eq("id", input.data.targetId).maybeSingle();
    if (!classItem) return { error: "This class isn’t available." };
    const { data: lectures } = await supabase.from("lectures").select("id, title").eq("class_id", classItem.id).eq("status", "ready");
    if (!lectures?.length) return { error: "This class doesn’t have any transcribed lectures yet." };
    const { data: transcriptRows } = await supabase.from("transcripts").select("lecture_id, segments").in("lecture_id", lectures.map((lecture) => lecture.id));
    const titles = new Map(lectures.map((lecture) => [lecture.id, lecture.title]));
    transcripts = (transcriptRows ?? []).flatMap((row) => {
      const parsed = transcriptSegmentsSchema.safeParse(row.segments);
      const title = titles.get(row.lecture_id);
      return parsed.success && title ? [{ lectureId: row.lecture_id, title, segments: parsed.data }] : [];
    });
  }

  const sources = rankTranscriptSources(input.data.question, transcripts);
  if (!sources.length) return { error: "No transcript sections were available to answer from." };
  let answer: string;
  try {
    answer = await answerFromTranscripts(input.data.question, input.data.scope, transcripts);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "AI couldn’t answer right now. Please try again." };
  }

  const { error } = await supabase.rpc("create_scope_ai_question", {
    target_class: classId,
    target_lecture: targetLecture,
    target_scope: input.data.scope,
    student_question: input.data.question,
    ai_answer: answer,
    answer_sources: sources as unknown as import("@/lib/database.types").Json,
  });
  if (error) {
    console.error("Could not save scoped AI question.", { code: error.code, message: error.message });
    return { error: "AI answered, but the response couldn’t be saved. Please try again." };
  }

  revalidatePath(`/classes/${classId}`);
  if (targetLecture) revalidatePath(`/classes/${classId}/lectures/${targetLecture}`);
  return { success: "Your private AI answer is ready." };
}
