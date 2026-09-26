import "server-only";
import type { TranscriptSegment } from "@/lib/validation";

export type LectureAiSource = {
  lecture_id: string;
  title: string;
  start_ms: number;
  end_ms: number;
  text: string;
};

const stopWords = new Set(["about", "after", "again", "also", "and", "are", "because", "before", "being", "between", "could", "does", "during", "from", "have", "into", "just", "more", "most", "other", "some", "such", "than", "that", "their", "them", "then", "there", "these", "they", "this", "those", "through", "what", "when", "where", "which", "while", "with", "would", "your", "lecture", "class"]);

function terms(value: string) {
  return [...new Set(value.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])].filter((word) => !stopWords.has(word));
}

export function rankTranscriptSources(
  question: string,
  transcripts: Array<{ lectureId: string; title: string; segments: TranscriptSegment[] }>,
): LectureAiSource[] {
  const queryTerms = terms(question);
  const ranked = transcripts.flatMap(({ lectureId, title, segments }) => segments.map((segment) => {
    const text = segment.text.trim();
    const contentTerms = terms(text);
    const hits = queryTerms.reduce((sum, term) => sum + (contentTerms.includes(term) ? 1 : 0), 0);
    const frequency = queryTerms.reduce((sum, term) => sum + contentTerms.filter((word) => word === term).length, 0);
    const exact = queryTerms.length && text.toLowerCase().includes(queryTerms.join(" ")) ? 2 : 0;
    return {
      source: { lecture_id: lectureId, title, start_ms: segment.start_ms, end_ms: segment.end_ms, text: text.slice(0, 600) },
      score: hits * 4 + Math.min(frequency, 6) + exact,
    };
  }).filter(({ source }) => source.text.length > 0));

  return ranked.sort((a, b) => b.score - a.score || a.source.start_ms - b.source.start_ms)
    .slice(0, 8)
    .map(({ source }) => source);
}

export async function answerFromSources(question: string, scope: "lecture" | "class", sources: LectureAiSource[]) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("AI questions aren’t configured yet. Add OPENAI_API_KEY to .env.local and restart the app.");
  const context = sources.map((source, index) =>
    `[${index + 1}] ${source.title} (${Math.floor(source.start_ms / 1000)}s): ${source.text}`,
  ).join("\n\n");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-6-luna",
      instructions: `You are a helpful teaching assistant answering a question using relevant transcript sections from the ${scope}. Use only the supplied transcript context. Be concise and accurate. If the context does not answer the question, say so. Do not invent details or citation numbers. Keep your answer under 300 words.`,
      input: `Transcript sections:\n${context}\n\nQuestion:\n${question}`,
      reasoning: { effort: "low" },
      max_output_tokens: 500,
      store: false,
    }),
    signal: AbortSignal.timeout(45000),
  });
  if (!response.ok) {
    console.error("OpenAI Responses API returned status", response.status);
    throw new Error("AI couldn’t answer right now. Please check the API setup and try again.");
  }
  const data: unknown = await response.json();
  const outputs = typeof data === "object" && data !== null && "output" in data && Array.isArray(data.output) ? data.output : [];
  const answer = outputs.flatMap((item) => typeof item === "object" && item !== null && "content" in item && Array.isArray(item.content) ? item.content : [])
    .flatMap((item) => typeof item === "object" && item !== null && "text" in item && typeof item.text === "string" ? [item.text] : [])
    .join("\n\n").trim();
  if (!answer || answer.length > 2700) throw new Error("AI returned an empty or overly long answer. Please try again.");
  return answer;
}
