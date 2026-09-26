import type { ReactNode } from "react";

const inlinePattern = /(\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|`[^`\n]+`|\*[^*\n]+\*|_[^_\n]+_|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))/g;

function renderInline(text: string): ReactNode[] {
  const result: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;

  for (const match of text.matchAll(inlinePattern)) {
    const index = match.index ?? 0;
    if (index > lastIndex) result.push(text.slice(lastIndex, index));
    const token = match[0];
    if (token.startsWith("**") || token.startsWith("__")) {
      result.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("~~")) {
      result.push(<del key={key++}>{token.slice(2, -2)}</del>);
    } else if (token.startsWith("`")) {
      result.push(<code key={key++} className="rounded bg-black/5 px-1 py-0.5 font-mono text-[0.9em]">{token.slice(1, -1)}</code>);
    } else if (token.startsWith("[") && match[2] && match[3]) {
      result.push(<a key={key++} href={match[3]} target="_blank" rel="noreferrer" className="text-[#1f70b7] underline underline-offset-2">{match[2]}</a>);
    } else {
      result.push(<em key={key++}>{token.slice(1, -1)}</em>);
    }
    lastIndex = index + token.length;
  }

  if (lastIndex < text.length) result.push(text.slice(lastIndex));
  return result;
}

function isBlockStart(line: string) {
  return /^#{1,3}\s|^\s*[-*+]\s+|^\s*\d+[.)]\s+|^```/.test(line);
}

export function AiAnswer({ text, className = "" }: { text: string; className?: string }) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    if (!lines[index].trim()) { index++; continue; }

    if (lines[index].startsWith("```")) {
      index++;
      const code: string[] = [];
      while (index < lines.length && !lines[index].startsWith("```")) code.push(lines[index++]);
      if (index < lines.length) index++;
      blocks.push(<pre key={`code-${index}`} className="overflow-x-auto rounded-lg bg-black/5 p-3 text-xs"><code>{code.join("\n")}</code></pre>);
      continue;
    }

    const heading = lines[index].match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const size = heading[1].length === 1 ? "text-base" : "text-sm";
      blocks.push(<h3 key={`heading-${index}`} className={`${size} font-semibold text-foreground`}>{renderInline(heading[2])}</h3>);
      index++;
      continue;
    }

    const unordered = lines[index].match(/^\s*[-*+]\s+(.+)$/);
    if (unordered) {
      const items: ReactNode[] = [];
      while (index < lines.length) {
        const item = lines[index].match(/^\s*[-*+]\s+(.+)$/);
        if (!item) break;
        items.push(<li key={`item-${index}`}>{renderInline(item[1])}</li>);
        index++;
      }
      blocks.push(<ul key={`list-${index}`} className="list-disc space-y-1 pl-5">{items}</ul>);
      continue;
    }

    const ordered = lines[index].match(/^\s*\d+[.)]\s+(.+)$/);
    if (ordered) {
      const items: ReactNode[] = [];
      while (index < lines.length) {
        const item = lines[index].match(/^\s*\d+[.)]\s+(.+)$/);
        if (!item) break;
        items.push(<li key={`item-${index}`}>{renderInline(item[1])}</li>);
        index++;
      }
      blocks.push(<ol key={`list-${index}`} className="list-decimal space-y-1 pl-5">{items}</ol>);
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index])) paragraph.push(lines[index++]);
    if (paragraph.length) {
      blocks.push(<p key={`paragraph-${index}`}>{paragraph.flatMap((line, lineIndex) => lineIndex === 0
        ? renderInline(line)
        : [<br key={`break-${lineIndex}`} />, ...renderInline(line)])}</p>);
    }
  }

  return <div className={`space-y-3 leading-6 ${className}`}>{blocks}</div>;
}
