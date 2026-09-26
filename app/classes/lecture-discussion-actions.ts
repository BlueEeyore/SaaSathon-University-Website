"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { transcriptQuestionSchema, transcriptReplySchema, transcriptSegmentsSchema, transcriptThreadSchema, type FormState } from "@/lib/validation";

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
  if (error) return { error: "We couldn’t post your reply. Please try again." };

  revalidatePath("/classes/[id]/lectures/[lectureId]", "page");
  return { success: "Reply added." };
}

export async function askAboutTranscript(_: FormState, form: FormData): Promise<FormState> {
  const input = transcriptQuestionSchema.safeParse({
    lectureId: form.get("lectureId"),
    parentId: form.get("parentId"),
    question: form.get("question"),
  });
  if (!input.success) return { error: input.error.issues[0]?.message ?? "Check your question." };

  const { supabase, userId } = await requireUser();
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { error: "AI questions aren’t configured yet. Add OPENAI_API_KEY to .env.local and restart the app." };

  const [{ data: parent }, { data: transcript }] = await Promise.all([
    supabase.from("transcript_comments").select("id, lecture_id, highlight_id, parent_id").eq("id", input.data.parentId).eq("lecture_id", input.data.lectureId).maybeSingle(),
    supabase.from("transcripts").select("segments").eq("lecture_id", input.data.lectureId).maybeSingle(),
  ]);
  if (!parent || parent.parent_id || !transcript) return { error: "That discussion is no longer available." };
  if (!parent.highlight_id) return { error: "AI questions are available for transcript highlights." };
  const { data: highlight } = await supabase.from("transcript_highlights")
    .select("start_ms, end_ms, quote")
    .eq("id", parent.highlight_id)
    .eq("lecture_id", input.data.lectureId)
    .maybeSingle();
  const parsed = transcriptSegmentsSchema.safeParse(transcript.segments);
  if (!highlight || !parsed.success) return { error: "The transcript passage is unavailable." };

  const relevant = parsed.data
    .filter((segment) => segment.end_ms >= highlight.start_ms - 15000 && segment.start_ms <= highlight.end_ms + 15000)
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
        instructions: "You are a helpful teaching assistant. Answer the student's question using the lecture excerpt. Be accurate and concise. If the excerpt does not contain enough information, say so. Do not invent details. Keep your answer below 350 words.",
        input: `Selected passage (${Math.floor(highlight.start_ms / 1000)}s):\n${highlight.quote}\n\nNearby lecture transcript:\n${relevant}\n\nStudent question:\n${input.data.question}`,
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

  const { error } = await supabase.from("transcript_comments").insert({
    lecture_id: input.data.lectureId,
    parent_id: parent.id,
    author_id: userId,
    body: `[AI answer]\nQuestion: ${input.data.question}\n\nAnswer: ${answer}`,
  });
  if (error) return { error: "AI answered, but the response could not be added to the class thread." };
  revalidatePath("/classes/[id]/lectures/[lectureId]", "page");
  return { success: "AI answer added to the class thread." };
}
