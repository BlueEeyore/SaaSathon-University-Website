import ReactMarkdown, { type Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

function normalizeLegacyMath(text: string) {
  return text.replace(/\(([^()\n]+)\)/g, (match, expression: string) => {
    const value = expression.trim();
    const isMath = /^[A-Za-z](?:[_^]\{?[A-Za-z0-9]+\}?)?$/.test(value) || /[_^]|\\[A-Za-z]+/.test(value);
    return isMath ? `$${value}$` : match;
  });
}

const markdownComponents: Components = {
  h1: ({ children }) => <h1 className="text-lg font-semibold tracking-tight text-foreground">{children}</h1>,
  h2: ({ children }) => <h2 className="text-base font-semibold tracking-tight text-foreground">{children}</h2>,
  h3: ({ children }) => <h3 className="text-sm font-semibold text-foreground">{children}</h3>,
  p: ({ children }) => <p>{children}</p>,
  ul: ({ children, className }) => <ul className={`list-disc space-y-1 pl-5 ${className ?? ""}`}>{children}</ul>,
  ol: ({ children, className }) => <ol className={`list-decimal space-y-1 pl-5 ${className ?? ""}`}>{children}</ol>,
  li: ({ children }) => <li className="ps-1">{children}</li>,
  blockquote: ({ children }) => <blockquote className="border-l-2 border-[#b7d5ef] pl-3 text-muted-foreground">{children}</blockquote>,
  a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer" className="text-[#1f70b7] underline underline-offset-2">{children}</a>,
  hr: () => <hr className="border-border" />,
  pre: ({ children }) => <pre className="overflow-x-auto rounded-lg bg-[#16212d] p-4 text-xs text-white">{children}</pre>,
  code: ({ children, className }) => <code className={`${className ? "font-mono text-xs" : "rounded bg-black/5 px-1 py-0.5 font-mono text-[0.9em]"} ${className ?? ""}`}>{children}</code>,
  table: ({ children }) => <div className="overflow-x-auto"><table className="w-full border-collapse text-left text-sm">{children}</table></div>,
  thead: ({ children }) => <thead className="border-b bg-[#f5f8fb]">{children}</thead>,
  th: ({ children }) => <th className="px-3 py-2 font-semibold">{children}</th>,
  td: ({ children }) => <td className="border-b px-3 py-2 align-top">{children}</td>,
  input: ({ checked, type }) => type === "checkbox" ? <input type="checkbox" checked={checked} disabled readOnly className="me-2 align-middle" /> : null,
};

export function AiAnswer({ text, className = "" }: { text: string; className?: string }) {
  return <div className={`space-y-3 leading-6 ${className}`}>
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[[rehypeKatex, { throwOnError: false }]]}
      components={markdownComponents}
    >{normalizeLegacyMath(text)}</ReactMarkdown>
  </div>;
}
