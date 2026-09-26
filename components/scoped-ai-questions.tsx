"use client";

import Link from "next/link";
import { useActionState, useRef } from "react";
import { LockKeyhole, Send, Sparkles } from "lucide-react";
import { askAboutScope } from "@/app/classes/lecture-discussion-actions";
import type { FormState, lectureAiSourceSchema } from "@/lib/validation";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

type Question = {
  id: string;
  question: string;
  answer: string;
  created_at: string;
  sources: z.infer<typeof lectureAiSourceSchema>[];
};

function clock(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function ScopedAiQuestions({
  scope, targetId, classId, questions, available = true,
}: {
  scope: "lecture" | "class";
  targetId: string;
  classId: string;
  questions: Question[];
  available?: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(async (previous: FormState, form: FormData) => {
    const result = await askAboutScope(previous, form);
    if (result.success) formRef.current?.reset();
    return result;
  }, {});
  const title = scope === "class" ? "Ask the whole class" : "Ask about the whole lecture";

  return <Card>
    <CardHeader className="border-b pb-4">
      <CardTitle className="flex items-center gap-2 text-base"><Sparkles className="size-4 text-[#1f70b7]" />{title}</CardTitle>
      <CardDescription className="flex items-center gap-1.5"><LockKeyhole className="size-3" />Private to you. AI uses the complete transcript{scope === "class" ? "s from ready lectures" : ""}; the links point to relevant moments.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-5 p-4">
      <form ref={formRef} action={action} className="space-y-3">
        <input type="hidden" name="scope" value={scope} />
        <input type="hidden" name="targetId" value={targetId} />
        <Textarea name="question" rows={3} maxLength={1200} required disabled={!available || pending}
          placeholder={scope === "class" ? "Ask about a concept covered across your lectures…" : "Ask anything about this lecture…"}
          aria-label={title} />
        {!available && <p className="text-xs text-muted-foreground">Transcribed lectures will be available here once they are ready.</p>}
        {state.error && <p role="alert" className="text-xs text-destructive">{state.error}</p>}
        {state.success && <p role="status" className="text-xs text-[#267249]">{state.success}</p>}
        <div className="flex justify-end"><Button type="submit" size="sm" disabled={!available || pending}><Send className="size-3.5" />{pending ? "Searching transcripts…" : "Ask AI"}</Button></div>
      </form>

      {questions.length > 0 ? <div className="space-y-4 border-t pt-4">
        <h3 className="text-sm font-semibold">Your {scope === "class" ? "class" : "lecture"} questions</h3>
        {questions.map((item) => <article key={item.id} className="space-y-3 rounded-xl border bg-white p-4">
          <div><p className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString()}</p><p className="mt-1 font-medium">{item.question}</p></div>
          <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{item.answer}</p>
          <div className="space-y-2 border-t pt-3">
            <p className="text-xs font-semibold text-foreground">Relevant transcript sections</p>
            {item.sources.map((source, index) => <Link key={`${source.lecture_id}-${source.start_ms}-${index}`}
              href={`/classes/${classId}/lectures/${source.lecture_id}?t=${source.start_ms}`}
              className="block rounded-lg bg-[#f5f8fb] p-3 text-xs transition hover:bg-[#eaf3fb]">
              <span className="font-medium text-[#1f70b7]">{source.title} · {clock(source.start_ms)}</span>
              <span className="mt-1 block leading-5 text-muted-foreground">“{source.text}”</span>
            </Link>)}
          </div>
        </article>)}
      </div> : null}
    </CardContent>
  </Card>;
}
