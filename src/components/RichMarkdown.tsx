import { useEffect, useRef, useState, memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import mermaid from "mermaid";

let mermaidInited = false;
function initMermaid() {
  if (mermaidInited) return;
  mermaidInited = true;
  mermaid.initialize({
    startOnLoad: false,
    theme: "default",
    securityLevel: "loose",
    fontFamily: "inherit",
  });
}

function MermaidBlock({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    initMermaid();
    let cancelled = false;
    const id = `m-${Math.random().toString(36).slice(2)}`;
    mermaid
      .render(id, code)
      .then(({ svg }) => {
        if (!cancelled && ref.current) ref.current.innerHTML = svg;
      })
      .catch((e) => {
        if (!cancelled) setErr(String(e?.message ?? e));
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (err) {
    return (
      <pre className="bg-muted p-3 rounded-lg overflow-x-auto text-xs">
        <code>{code}</code>
      </pre>
    );
  }
  return <div ref={ref} className="my-3 flex justify-center [&_svg]:max-w-full [&_svg]:h-auto" />;
}

/**
 * Normalizes AI output so LaTeX renders reliably:
 * - Converts common bracket forms \( \) and \[ \] into $ $ and $$ $$
 * - Leaves fenced code blocks untouched
 */
function normalizeMath(input: string): string {
  const parts = input.split(/(```[\s\S]*?```|`[^`]*`)/g);
  return parts
    .map((chunk) => {
      if (chunk.startsWith("```") || chunk.startsWith("`")) return chunk;
      return chunk
        .replace(/\\\[([\s\S]+?)\\\]/g, (_m, g1) => `\n\n$$${g1}$$\n\n`)
        .replace(/\\\(([\s\S]+?)\\\)/g, (_m, g1) => `$${g1}$`);
    })
    .join("");
}

export const RichMarkdown = memo(function RichMarkdown({ children }: { children: string }) {
  const source = normalizeMath(children || " ");
  return (
    <div className="rich-md text-sm leading-relaxed break-words [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 [&_h1]:text-lg [&_h1]:font-bold [&_h1]:mt-3 [&_h2]:text-base [&_h2]:font-bold [&_h2]:mt-3 [&_h3]:font-semibold [&_h3]:mt-2 [&_a]:text-primary [&_a]:underline [&_strong]:font-semibold [&_blockquote]:border-l-2 [&_blockquote]:border-primary/40 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_hr]:my-4 [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden [&_.katex-display]:py-1">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          code({ className, children, ...props }) {
            const text = String(children ?? "").replace(/\n$/, "");
            const isBlock = /\n/.test(text) || (className ?? "").includes("language-");
            const lang = (className ?? "").replace("language-", "").trim();
            if (isBlock && lang === "mermaid") {
              return <MermaidBlock code={text} />;
            }
            if (isBlock) {
              return (
                <pre className="bg-muted p-3 rounded-lg overflow-x-auto my-2">
                  <code className={`text-xs ${className ?? ""}`} {...props}>
                    {text}
                  </code>
                </pre>
              );
            }
            return (
              <code className="bg-muted rounded px-1 py-0.5 text-[0.85em]" {...props}>
                {children}
              </code>
            );
          },
          table({ children }) {
            return (
              <div className="my-3 overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm border-collapse">{children}</table>
              </div>
            );
          },
          thead({ children }) {
            return <thead className="bg-muted">{children}</thead>;
          },
          th({ children }) {
            return <th className="text-left font-semibold px-3 py-2 border-b border-border">{children}</th>;
          },
          td({ children }) {
            return <td className="px-3 py-2 border-b border-border/60 align-top">{children}</td>;
          },
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
});
