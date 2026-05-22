"use client";

import { useState } from "react";
import type { ApiChunk } from "@/lib/api/types";
import { MarkdownAnswer } from "@/components/markdown-answer";
import { BookmarkIcon } from "@/components/icons-extra";

type Props = {
  answer: string;
  chunks: ApiChunk[];
  savedChunkIds: Set<number>;
  onToggleSave: (chunk: ApiChunk) => void;
  onOpenSource?: (chunk: ApiChunk) => void;
};

export function CitedAnswer({
  answer,
  chunks,
  savedChunkIds,
  onToggleSave,
  onOpenSource,
}: Props) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  return (
    <div className="space-y-4">
      <div className="text-sm leading-relaxed">
        <MarkdownAnswer
          text={answer}
          onCitationClick={(n) => setOpenIdx(openIdx === n ? null : n)}
        />
      </div>

      {chunks.length > 0 && (
        <div className="border-t border-[var(--border)] pt-4">
          <p className="text-[11px] uppercase tracking-wider text-[var(--muted)] mb-2">
            Sources
          </p>
          <ol className="space-y-2">
            {chunks.map((c, i) => {
              const isOpen = openIdx === i + 1;
              const isSaved = savedChunkIds.has(c.id);
              return (
                <li
                  key={c.id}
                  className={`rounded-md border text-xs transition-colors ${
                    isOpen
                      ? "border-[var(--accent)]/50 bg-[var(--accent)]/[0.08]"
                      : "border-[var(--border)] bg-zinc-900/40"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <button
                      onClick={() => setOpenIdx(isOpen ? null : i + 1)}
                      className="flex-1 flex items-start gap-3 px-3 py-2 text-left"
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
                    <button
                      onClick={() => onToggleSave(c)}
                      className={`px-2 py-2 transition-colors ${
                        isSaved
                          ? "text-[var(--accent)]"
                          : "text-[var(--muted)] hover:text-zinc-200"
                      }`}
                      aria-label={isSaved ? "Remove from saved" : "Save passage"}
                      title={isSaved ? "Remove from saved" : "Save passage"}
                    >
                      <BookmarkIcon className="w-3.5 h-3.5" filled={isSaved} />
                    </button>
                  </div>
                  {isOpen && (
                    <div className="px-3 pb-3 -mt-1 space-y-2">
                      <div className="text-zinc-300 leading-relaxed whitespace-pre-wrap">
                        {c.text}
                      </div>
                      {onOpenSource && (
                        <button
                          onClick={() => onOpenSource(c)}
                          className="text-[10px] uppercase tracking-wider text-[var(--accent)] hover:brightness-110"
                        >
                          Open in PDF →
                        </button>
                      )}
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
