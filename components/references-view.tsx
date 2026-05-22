"use client";

import type { DocumentRow } from "@/lib/api/types";

type Props = {
  document: DocumentRow;
  library: DocumentRow[];
  onJumpToDocument: (id: string) => void;
};

/**
 * Cross-match a reference string against other documents in the user's
 * library by checking whether the doc's title (or the first 5 significant
 * words of it) appears in the reference text.
 */
function findCrossMatch(
  reference: string,
  library: DocumentRow[],
  selfId: string,
): DocumentRow | null {
  const refNorm = reference.toLowerCase();
  for (const doc of library) {
    if (doc.id === selfId) continue;
    const title = doc.title.toLowerCase().trim();
    if (!title) continue;
    if (refNorm.includes(title)) return doc;
    // Fall back to checking the first few significant words.
    const words = title
      .split(/[\s_\-:.,]+/)
      .filter((w) => w.length > 3)
      .slice(0, 4);
    if (words.length >= 3 && words.every((w) => refNorm.includes(w))) {
      return doc;
    }
  }
  return null;
}

export function ReferencesView({ document, library, onJumpToDocument }: Props) {
  const refs = document.references ?? [];

  if (refs.length === 0) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center text-sm text-[var(--muted)]">
        No references were extracted from this document.
        <p className="mt-1.5 text-xs">
          This usually means the PDF didn&apos;t include a bibliography.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <p className="text-[10px] uppercase tracking-wider text-[var(--muted)] mb-3">
        References · {refs.length}
        {library.length > 1 && (
          <span className="text-[var(--accent)]/80 ml-2 normal-case tracking-normal">
            Highlights show items also in your library.
          </span>
        )}
      </p>
      <ol className="space-y-2">
        {refs.map((r, i) => {
          const match = findCrossMatch(r, library, document.id);
          return (
            <li
              key={i}
              className={`rounded-md border text-xs leading-relaxed px-3 py-2 transition-colors
                          ${
                            match
                              ? "border-[var(--accent)]/40 bg-[var(--accent)]/[0.07]"
                              : "border-[var(--border)] bg-zinc-900/40"
                          }`}
            >
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-[10px] text-[var(--muted)] shrink-0 mt-0.5">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="flex-1 text-zinc-200">{r}</div>
              </div>
              {match && (
                <div className="mt-2 ml-7 flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wider text-[var(--accent)]">
                    in your library
                  </span>
                  <button
                    onClick={() => onJumpToDocument(match.id)}
                    className="text-[11px] text-[var(--accent)] hover:brightness-110 underline-offset-2 hover:underline"
                  >
                    Open “{match.title}” →
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
