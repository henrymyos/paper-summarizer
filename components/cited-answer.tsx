"use client";

import { useState } from "react";
import type { ApiChunk } from "@/lib/api/types";

type Props = {
  answer: string;
  chunks: ApiChunk[];
};

export function CitedAnswer({ answer, chunks }: Props) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  const parts = renderWithCitations(answer, (idx) => (
    <CitationPill
      key={`c-${idx}`}
      n={idx}
      onClick={() => setOpenIdx(openIdx === idx ? null : idx)}
    />
  ));

  return (
    <div className="space-y-4">
      <div className="prose-invert text-sm leading-relaxed text-zinc-100 whitespace-pre-wrap">
        {parts}
      </div>

      {chunks.length > 0 && (
        <div className="border-t border-[var(--border)] pt-4">
          <p className="text-[11px] uppercase tracking-wider text-[var(--muted)] mb-2">
            Sources
          </p>
          <ol className="space-y-2">
            {chunks.map((c, i) => {
              const isOpen = openIdx === i + 1;
              return (
                <li
                  key={c.id}
                  className={`rounded-md border text-xs transition-colors ${
                    isOpen
                      ? "border-[var(--accent)]/50 bg-[var(--accent)]/[0.08]"
                      : "border-[var(--border)] bg-zinc-900/40"
                  }`}
                >
                  <button
                    onClick={() => setOpenIdx(isOpen ? null : i + 1)}
                    className="w-full flex items-start gap-3 px-3 py-2 text-left"
                  >
                    <span className="mt-0.5 font-mono text-[10px] text-[var(--accent)]">
                      [{i + 1}]
                    </span>
                    <span className="flex-1 text-[var(--muted)]">
                      page {c.page_number ?? "?"}
                      {c.similarity !== null && (
                        <> · similarity {c.similarity.toFixed(2)}</>
                      )}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="px-3 pb-3 -mt-1 text-zinc-300 leading-relaxed whitespace-pre-wrap">
                      {c.text}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}

function CitationPill({ n, onClick }: { n: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center justify-center align-baseline mx-0.5 px-1.5 py-0.5 text-[10px] font-mono
                 rounded-md bg-[var(--accent)]/15 text-[var(--accent)] hover:bg-[var(--accent)]/25 transition-colors"
      aria-label={`Source ${n}`}
    >
      {n}
    </button>
  );
}

/**
 * Split a string like "Foo [1] bar [2,3] baz." into nodes where each [n] (or
 * [n,m]) becomes one or more clickable pills. Anything else is left as text.
 * Also strips the brackets so the answer reads cleanly.
 */
function renderWithCitations(
  text: string,
  renderPill: (n: number) => React.ReactNode,
): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /\[(\d+(?:\s*,\s*\d+)*)\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      out.push(<span key={`t-${key++}`}>{text.slice(last, m.index)}</span>);
    }
    const nums = m[1].split(",").map((s) => parseInt(s.trim(), 10));
    nums.forEach((n) => out.push(renderPill(n)));
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    out.push(<span key={`t-${key++}`}>{text.slice(last)}</span>);
  }
  return out;
}
