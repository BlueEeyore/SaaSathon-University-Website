"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { MessageSquareQuote, Send, Sparkles } from "lucide-react";
import { askAboutTranscript, createTranscriptThread, replyToTranscriptThread } from "@/app/classes/lecture-discussion-actions";
import type { FormState, TranscriptSegment } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

type Highlight = { id: string; lecture_id: string; start_ms: number; end_ms: number; quote: string; user_id: string };
type Comment = { id: string; lecture_id: string; highlight_id: string | null; parent_id: string | null; author_id: string; body: string; created_at: string };
type AiQuestion = { id: string; lecture_id: string; highlight_id: string; user_id: string; question: string; answer: string; created_at: string };
type Person = { user_id: string; full_name: string; email: string };
type Thread = { highlight: Highlight | null; startMs: number; endMs: number; quote: string; comments: Comment[] };

function clock(ms: number) {
  const sec = Math.floor(ms / 1000);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

function formattedDate(value: string) {
  return `${value.slice(0, 16).replace("T", " ")} UTC`;
}

function Author({ id, people }: { id: string; people: Map<string, Person> }) {
  const person = people.get(id);
  return <span className="font-medium text-foreground">{person?.full_name || person?.email || "Class member"}</span>;
}

function ReplyForm({ lectureId, parentId }: { lectureId: string; parentId: string }) {
  const [state, action, pending] = useActionState(replyToTranscriptThread, {});
  return <form action={action} className="mt-3 space-y-2">
    <input type="hidden" name="lectureId" value={lectureId} />
    <input type="hidden" name="parentId" value={parentId} />
    <Textarea name="body" rows={2} maxLength={4000} placeholder="Reply to this thread…" aria-label="Reply to this thread" />
    {state.error && <p className="text-xs text-destructive">{state.error}</p>}
    {state.success && <p className="text-xs text-[#267249]">{state.success}</p>}
    <div className="flex justify-end"><Button type="submit" size="sm" disabled={pending}><Send className="size-3.5" />{pending ? "Posting…" : "Reply"}</Button></div>
  </form>;
}

function AskAiForm({
  lectureId, selection, onComplete,
}: {
  lectureId: string;
  selection: { startMs: number; endMs: number; quote: string };
  onComplete: () => void;
}) {
  const [state, action, pending] = useActionState(async (previous: FormState, form: FormData) => {
    const result = await askAboutTranscript(previous, form);
    if (result.success) onComplete();
    return result;
  }, {});
  return <form action={action} className="mt-4 rounded-xl border border-[#d8e5ef] bg-[#f8fbfd] p-3">
    <input type="hidden" name="lectureId" value={lectureId} />
    <input type="hidden" name="startMs" value={selection.startMs} />
    <input type="hidden" name="endMs" value={selection.endMs} />
    <p className="mb-2 flex items-center gap-1.5 text-xs font-medium"><Sparkles className="size-3.5 text-[#1f70b7]" />Ask AI about this passage</p>
    <Textarea name="question" rows={2} maxLength={1200} placeholder="Ask a question about the highlighted passage…" aria-label="Ask AI about the selected transcript passage" />
    {state.error && <p className="mt-2 text-xs text-destructive">{state.error}</p>}
    {state.success && <p className="mt-2 text-xs text-[#267249]">{state.success}</p>}
    <div className="mt-2 flex justify-end"><Button type="submit" size="sm" variant="outline" disabled={pending}><Sparkles className="size-3.5" />{pending ? "Thinking…" : "Ask AI"}</Button></div>
  </form>;
}

export function TranscriptDiscussion({
  lectureId, segments, highlights, comments, aiQuestions, profiles, activeIndex, onSeek,
}: {
  lectureId: string;
  segments: TranscriptSegment[];
  highlights: Highlight[];
  comments: Comment[];
  aiQuestions: AiQuestion[];
  profiles: Person[];
  activeIndex: number;
  onSeek: (milliseconds: number) => void;
}) {
  const transcriptRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<{ startMs: number; endMs: number; quote: string } | null>(null);
  const [selectionMode, setSelectionMode] = useState<"choose" | "comment" | "ai">("choose");
  const [activeHighlightId, setActiveHighlightId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"comments" | "ai">("comments");
  const [state, action, pending] = useActionState(async (previous: FormState, form: FormData) => {
    const result = await createTranscriptThread(previous, form);
    if (result.success) {
      setSelection(null);
      setSelectionMode("choose");
      window.getSelection()?.removeAllRanges();
    }
    return result;
  }, {});
  const people = useMemo(() => new Map(profiles.map((profile) => [profile.user_id, profile])), [profiles]);

  const threads: Thread[] = useMemo(() => highlights.map((highlight) => ({
    highlight,
    startMs: highlight.start_ms,
    endMs: highlight.end_ms,
    quote: highlight.quote,
    comments: comments.filter((comment) => comment.highlight_id === highlight.id ||
      (comment.parent_id != null && comments.some((parent) => parent.highlight_id === highlight.id && parent.id === comment.parent_id)))
      .sort((a, b) => a.created_at.localeCompare(b.created_at)),
  })).filter((thread) => thread.comments.length > 0), [comments, highlights]);

  function captureSelection() {
    const currentSelection = window.getSelection();
    if (!currentSelection?.rangeCount) return;
    const range = currentSelection.getRangeAt(0);
    const quote = currentSelection.toString().trim();
    if (!range || !quote || !transcriptRef.current?.contains(range.commonAncestorContainer)) return;
    const words = Array.from(transcriptRef.current.querySelectorAll<HTMLElement>("[data-word-start]"))
      .filter((word) => {
        try { return range.intersectsNode(word); } catch { return false; }
      });
    if (!words.length) return;
    const startMs = Number(words[0].dataset.wordStart);
    const endMs = Number(words[words.length - 1].dataset.wordEnd);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return;
    setSelection({ startMs, endMs, quote: quote.slice(0, 600) });
    setSelectionMode("choose");
    setActiveTab("comments");
    setActiveHighlightId(null);
  }

  function openHighlight(highlightId: string) {
    setActiveHighlightId(highlightId);
    setSelection(null);
    const hasComments = threads.some((thread) => thread.highlight?.id === highlightId);
    const hasAiQuestions = aiQuestions.some((question) => question.highlight_id === highlightId);
    setActiveTab(hasAiQuestions && !hasComments ? "ai" : "comments");
  }

  function handleWordClick(highlightId: string | undefined) {
    if (window.getSelection()?.toString().trim()) return;
    if (highlightId) openHighlight(highlightId);
  }

  const selectedThread = threads.find((thread) => thread.highlight?.id === activeHighlightId) ?? null;
  const visibleAiQuestions = activeHighlightId
    ? aiQuestions.filter((question) => question.highlight_id === activeHighlightId)
    : aiQuestions;

  useEffect(() => {
    if (activeIndex < 0) return;
    transcriptRef.current?.querySelector(`[data-segment-index="${activeIndex}"]`)?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  }, [activeIndex]);

  return <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.85fr)]">
    <Card className="flex min-h-[420px] flex-col xl:max-h-[calc(100vh-150px)]">
      <CardHeader className="border-b pb-4">
        <CardTitle className="text-base">Transcript & discussion</CardTitle>
        <p className="text-xs text-muted-foreground">Select words to comment or ask AI about a passage. Click a highlight to open its notes.</p>
      </CardHeader>
      <CardContent ref={transcriptRef} onMouseUp={captureSelection} className="flex-1 overflow-y-auto px-0 pb-2 select-text">
        {segments.length ? <div className="divide-y divide-border">
          {segments.map((segment) => <div key={segment.index} data-segment-index={segment.index} className={`flex gap-3 px-5 py-3 text-sm leading-7 ${activeIndex === segment.index ? "bg-[#eaf3fb]" : ""}`}>
            <button type="button" onClick={() => onSeek(segment.start_ms)} className="mt-0.5 h-fit shrink-0 font-mono text-xs text-[#1f70b7] hover:underline" aria-label={`Seek to ${clock(segment.start_ms)}`}>{clock(segment.start_ms)}</button>
            <span>
              {segment.words.length ? segment.words.map((word, index) => {
                const matching = highlights.filter((item) => item.start_ms < word.end_ms && item.end_ms > word.start_ms);
                return <span
                  key={`${segment.index}-${index}`}
                  data-word-start={word.start_ms}
                  data-word-end={word.end_ms}
                  onClick={() => handleWordClick(matching[0]?.id)}
                  className={`rounded-sm px-[1px] ${matching.length ? "cursor-pointer bg-amber-200/80 decoration-amber-500 underline decoration-2 underline-offset-2 hover:bg-amber-300/80" : ""} ${matching.some((item) => item.id === activeHighlightId) ? "bg-amber-300" : ""}`}
                >{word.w}</span>;
              }) : <span data-word-start={segment.start_ms} data-word-end={segment.end_ms}>{segment.text}</span>}
            </span>
          </div>)}</div> : <p className="p-5 text-sm text-muted-foreground">The transcript is not available yet.</p>}
      </CardContent>
    </Card>

    <Card className="flex min-h-[420px] flex-col xl:max-h-[calc(100vh-150px)]">
      <CardHeader className="border-b pb-4">
        <CardTitle className="text-base">Passage discussion</CardTitle>
        <p className="text-xs text-muted-foreground">Select transcript text to comment or ask AI. Both are visible to the class.</p>
        <div className="mt-3 flex gap-2">
          <Button type="button" size="sm" variant={activeTab === "comments" ? "default" : "outline"} onClick={() => setActiveTab("comments")}><MessageSquareQuote className="size-3.5" />Comments</Button>
          <Button type="button" size="sm" variant={activeTab === "ai" ? "default" : "outline"} onClick={() => setActiveTab("ai")}><Sparkles className="size-3.5" />AI Q&amp;A</Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-4 overflow-y-auto p-4">
        {selection && selectionMode === "choose" ? <div className="rounded-xl border border-[#cbdff0] bg-[#f4f9fd] p-4">
          <p className="mb-2 text-xs font-medium text-[#1f70b7]">{clock(selection.startMs)} · Selected passage</p>
          <blockquote className="mb-3 border-l-2 border-amber-400 pl-3 text-sm text-muted-foreground">“{selection.quote}”</blockquote>
          <p className="mb-3 text-xs text-muted-foreground">What would you like to do with this passage?</p>
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={() => { setSelectionMode("comment"); setActiveTab("comments"); }}><MessageSquareQuote className="size-3.5" />Comment</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => { setSelectionMode("ai"); setActiveTab("ai"); }}><Sparkles className="size-3.5" />Ask AI</Button>
            <Button type="button" size="sm" variant="ghost" className="ml-auto" onClick={() => setSelection(null)}>Cancel</Button>
          </div>
        </div> : null}

        {selection && selectionMode === "comment" ? <form action={action} className="rounded-xl border border-[#cbdff0] bg-[#f4f9fd] p-4">
          <input type="hidden" name="lectureId" value={lectureId} />
          <input type="hidden" name="startMs" value={selection.startMs} />
          <input type="hidden" name="endMs" value={selection.endMs} />
          <input type="hidden" name="quote" value={selection.quote} />
          <p className="mb-2 text-xs font-medium text-[#1f70b7]">{clock(selection.startMs)} · Selected passage</p>
          <blockquote className="mb-3 border-l-2 border-amber-400 pl-3 text-sm text-muted-foreground">“{selection.quote}”</blockquote>
          <Textarea name="body" rows={3} maxLength={4000} placeholder="Add a comment…" aria-label="Add a comment" autoFocus />
          {state.error && <p className="mt-2 text-xs text-destructive">{state.error}</p>}
          <div className="mt-3 flex justify-end gap-2"><Button type="button" variant="ghost" size="sm" onClick={() => setSelectionMode("choose")}>Back</Button><Button type="submit" size="sm" disabled={pending}>{pending ? "Posting…" : "Comment"}</Button></div>
        </form> : null}

        {selection && selectionMode === "ai" ? <div className="rounded-xl border border-[#cbdff0] bg-[#f4f9fd] p-4">
          <p className="mb-2 text-xs font-medium text-[#1f70b7]">{clock(selection.startMs)} · Ask about this passage</p>
          <blockquote className="border-l-2 border-amber-400 pl-3 text-sm text-muted-foreground">“{selection.quote}”</blockquote>
          <AskAiForm
            lectureId={lectureId}
            selection={selection}
            onComplete={() => {
              setSelection(null);
              setSelectionMode("choose");
              setActiveTab("ai");
              window.getSelection()?.removeAllRanges();
            }}
          />
          <div className="mt-2 flex justify-end"><Button type="button" size="sm" variant="ghost" onClick={() => setSelectionMode("choose")}>Back</Button></div>
        </div> : null}

        {activeTab === "comments" && selectedThread ? <div className="rounded-xl border border-amber-300 bg-amber-50/70 p-4">
          <p className="mb-2 flex items-center justify-between text-xs font-medium text-[#1f70b7]"><span>{clock(selectedThread.startMs)} · Selected passage</span><button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setActiveHighlightId(null)}>Close</button></p>
          <blockquote className="mb-4 border-l-2 border-amber-400 pl-3 text-sm">“{selectedThread.quote}”</blockquote>
          {selectedThread.comments.map((comment) => comment.parent_id === null ? <div key={comment.id} className="border-t border-amber-200 pt-3 first:border-0 first:pt-0">
            <p className="text-xs text-muted-foreground"><Author id={comment.author_id} people={people} /> · {formattedDate(comment.created_at)}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{comment.body}</p>
            {selectedThread.comments.filter((reply) => reply.parent_id === comment.id).map((reply) => <div key={reply.id} className="ml-4 mt-3 border-l-2 border-[#d8e5ef] pl-3">
              <p className="text-xs text-muted-foreground"><Author id={reply.author_id} people={people} /> · {formattedDate(reply.created_at)}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{reply.body}</p>
            </div>)}
            <ReplyForm lectureId={lectureId} parentId={comment.id} />
          </div> : null)}
          <p className="mt-2 text-center text-[11px] text-muted-foreground">Comments and replies are visible to everyone in the class.</p>
        </div> : null}

        {activeTab === "comments" && !selection && !selectedThread && !threads.length && <div className="flex h-32 flex-col items-center justify-center text-center text-sm text-muted-foreground"><MessageSquareQuote className="mb-2 size-5 opacity-40" />No comments yet. Select a passage and choose Comment to start a thread.</div>}
        {activeTab === "comments" && threads.filter((thread) => thread.highlight?.id !== activeHighlightId).map((thread) => <button
          type="button"
          key={thread.highlight?.id}
          onClick={() => thread.highlight && openHighlight(thread.highlight.id)}
          className="w-full rounded-xl border bg-white p-4 text-left transition hover:border-[#9ec5e4] hover:shadow-sm"
        >
          <p className="mb-2 line-clamp-2 border-l-2 border-amber-300 pl-2 text-xs text-muted-foreground">“{thread.quote}”</p>
          {thread.comments.filter((comment) => comment.parent_id === null).slice(0, 1).map((comment) => <span key={comment.id}>
            <span className="text-xs text-muted-foreground"><Author id={comment.author_id} people={people} /> · {clock(thread.startMs)}</span>
            <span className="mt-1 block line-clamp-2 text-sm text-foreground">{comment.body}</span>
          </span>)}
          <span className="mt-2 block text-[11px] text-muted-foreground">{thread.comments.length} {thread.comments.length === 1 ? "comment" : "comments"} · Reply</span>
        </button>)}

        {activeTab === "ai" && visibleAiQuestions.map((item) => {
          const highlight = highlights.find((candidate) => candidate.id === item.highlight_id);
          return <article key={item.id} className="rounded-xl border bg-white p-4">
            {highlight && <button type="button" onClick={() => onSeek(highlight.start_ms)} className="mb-2 block line-clamp-2 border-l-2 border-amber-300 pl-2 text-left text-xs text-muted-foreground hover:text-foreground">“{highlight.quote}” · {clock(highlight.start_ms)}</button>}
            <p className="text-xs text-muted-foreground"><Author id={item.user_id} people={people} /> asked · {formattedDate(item.created_at)}</p>
            <p className="mt-2 text-sm font-medium">{item.question}</p>
            <div className="mt-3 border-t pt-3">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-[#1f70b7]"><Sparkles className="size-3.5" />AI answer</p>
              <p className="whitespace-pre-wrap text-sm leading-6">{item.answer}</p>
            </div>
          </article>;
        })}
        {activeTab === "ai" && !selection && !visibleAiQuestions.length && <div className="flex h-32 flex-col items-center justify-center text-center text-sm text-muted-foreground"><Sparkles className="mb-2 size-5 opacity-40" />No AI questions yet. Select a passage and choose Ask AI.</div>}
      </CardContent>
    </Card>
  </div>;
}
