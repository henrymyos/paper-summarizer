"use client";

import type { DocumentRow } from "@/lib/api/types";

export function StructureView({ document }: { document: DocumentRow }) {
  const structure = document.structure;
  const hasAnything =
    !!structure &&
    (structure.sections.length > 0 ||
      structure.figures.length > 0 ||
      structure.tables.length > 0);

  if (!hasAnything) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center text-sm text-[var(--muted)]">
        No structured outline was extracted from this document.
        <p className="mt-1.5 text-xs">
          Re-uploading the PDF will retry structure extraction.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {document.summary && (
        <section>
          <p className="text-[10px] uppercase tracking-wider text-[var(--muted)] mb-2">
            Summary
          </p>
          <p className="text-sm text-zinc-200 leading-relaxed">
            {document.summary}
          </p>
        </section>
      )}

      {structure!.sections.length > 0 && (
        <section>
          <p className="text-[10px] uppercase tracking-wider text-[var(--muted)] mb-2">
            Sections
          </p>
          <ol className="space-y-1.5">
            {structure!.sections.map((s, i) => (
              <li
                key={`${s.title}-${i}`}
                className="flex items-baseline justify-between gap-3 text-sm border-b border-[var(--border)]/60 pb-1.5"
              >
                <span className="text-zinc-200">
                  <span className="font-mono text-[10px] text-[var(--accent)] mr-2">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {s.title}
                </span>
                {s.page !== undefined && (
                  <span className="text-[11px] text-[var(--muted)] shrink-0">
                    page {s.page}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      {structure!.figures.length > 0 && (
        <section>
          <p className="text-[10px] uppercase tracking-wider text-[var(--muted)] mb-2">
            Figures
          </p>
          <ul className="space-y-2">
            {structure!.figures.map((f, i) => (
              <li
                key={`${f.label}-${i}`}
                className="rounded-md border border-[var(--border)] bg-zinc-900/40 px-3 py-2 text-xs"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium text-zinc-100">{f.label}</span>
                  {f.page !== undefined && (
                    <span className="text-[11px] text-[var(--muted)] shrink-0">
                      page {f.page}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-zinc-300 leading-relaxed">{f.caption}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {structure!.tables.length > 0 && (
        <section>
          <p className="text-[10px] uppercase tracking-wider text-[var(--muted)] mb-2">
            Tables
          </p>
          <ul className="space-y-2">
            {structure!.tables.map((t, i) => (
              <li
                key={`${t.label}-${i}`}
                className="rounded-md border border-[var(--border)] bg-zinc-900/40 px-3 py-2 text-xs"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium text-zinc-100">{t.label}</span>
                  {t.page !== undefined && (
                    <span className="text-[11px] text-[var(--muted)] shrink-0">
                      page {t.page}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-zinc-300 leading-relaxed">{t.caption}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
