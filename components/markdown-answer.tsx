"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { visit } from "unist-util-visit";
import type { Plugin } from "unified";
import type { Root, Text, RootContent } from "mdast";

/**
 * Remark plugin: turn "[1]" or "[2,3]" tokens in text nodes into custom
 * AST nodes that render as <cite data-n="1">1</cite> via the hast bridge.
 * Using hName/hProperties keeps HTML escaping out of the picture.
 */
const remarkCitations: Plugin<[], Root> = () => (tree) => {
  visit(tree, "text", (node: Text, index, parent) => {
    if (!parent || typeof index !== "number") return;
    const regex = /\[(\d+(?:\s*,\s*\d+)*)\]/g;
    const value = node.value;
    if (!regex.test(value)) return;

    const out: RootContent[] = [];
    let last = 0;
    regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(value)) !== null) {
      if (m.index > last) {
        out.push({ type: "text", value: value.slice(last, m.index) });
      }
      const nums = m[1].split(",").map((s) => s.trim());
      for (const n of nums) {
        out.push({
          type: "emphasis", // any block carrier — overridden by hName below
          data: {
            hName: "cite",
            hProperties: { "data-n": n },
          },
          children: [{ type: "text", value: n }],
        } as RootContent);
      }
      last = m.index + m[0].length;
    }
    if (last < value.length) {
      out.push({ type: "text", value: value.slice(last) });
    }
    parent.children.splice(index, 1, ...out);
  });
};

type Props = {
  text: string;
  onCitationClick?: (n: number) => void;
};

export function MarkdownAnswer({ text, onCitationClick }: Props) {
  const components: Components = {
    h1: (props) => <h1 className="text-lg font-semibold mt-4 mb-2" {...props} />,
    h2: (props) => <h2 className="text-base font-semibold mt-4 mb-2" {...props} />,
    h3: (props) => <h3 className="text-sm font-semibold mt-3 mb-1.5" {...props} />,
    p: (props) => <p className="text-sm leading-relaxed my-2" {...props} />,
    ul: (props) => <ul className="list-disc pl-5 my-2 space-y-1 text-sm" {...props} />,
    ol: (props) => <ol className="list-decimal pl-5 my-2 space-y-1 text-sm" {...props} />,
    li: (props) => <li className="leading-relaxed" {...props} />,
    strong: (props) => <strong className="font-semibold text-zinc-50" {...props} />,
    em: (props) => <em className="italic" {...props} />,
    a: ({ href, ...rest }) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[var(--accent)] underline underline-offset-2 hover:brightness-110"
        {...rest}
      />
    ),
    code: ({ children, className }) => {
      const isBlock = (className ?? "").includes("language-");
      return isBlock ? (
        <code className="block rounded-md bg-zinc-900 border border-[var(--border)] px-3 py-2 text-xs font-mono overflow-x-auto">
          {children}
        </code>
      ) : (
        <code className="rounded bg-zinc-800/60 px-1 py-0.5 text-[12px] font-mono">{children}</code>
      );
    },
    pre: ({ children }) => <pre className="my-3">{children}</pre>,
    blockquote: (props) => (
      <blockquote className="border-l-2 border-[var(--accent)]/40 pl-3 my-2 text-zinc-300" {...props} />
    ),
    table: (props) => (
      <div className="my-3 overflow-x-auto">
        <table className="text-xs border-collapse" {...props} />
      </div>
    ),
    th: (props) => <th className="border border-[var(--border)] px-2 py-1 text-left bg-zinc-900/60" {...props} />,
    td: (props) => <td className="border border-[var(--border)] px-2 py-1" {...props} />,
    // Our custom citation tag. unified gives it a hyphen-less HTML tag name.
    // We render it as a clickable pill.
    cite: ({ ...props }) => {
      const dataN = (props as { "data-n"?: string })["data-n"];
      const n = Number(dataN);
      if (Number.isNaN(n)) return <cite {...props} />;
      return (
        <button
          type="button"
          onClick={() => onCitationClick?.(n)}
          className="inline-flex items-center justify-center align-baseline mx-0.5 px-1.5 py-0.5 text-[10px] font-mono not-italic
                     rounded-md bg-[var(--accent)]/20 text-[var(--accent)] hover:bg-[var(--accent)]/30 transition-colors"
          aria-label={`Source ${n}`}
        >
          {n}
        </button>
      );
    },
  };

  return (
    <div className="text-zinc-100">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkCitations]}
        components={components}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
