"use client";

import { useEffect, useState, useCallback } from "react";
import type { Annotation, DocumentRow } from "@/lib/api/types";
import { BookmarkIcon } from "@/components/icons-extra";
import { MenuIcon, TrashIcon } from "@/components/icons";

type Props = {
  documents: DocumentRow[];
  onJumpToDocument: (id: string) => void;
  onOpenSidebar: () => void;
};

export function SavedPassages({
  documents,
  onJumpToDocument,
  onOpenSidebar,
}: Props) {
  const [items, setItems] = useState<Annotation[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/annotations", { cache: "no-store" });
    if (res.ok) {
      const { annotations } = (await res.json()) as { annotations: Annotation[] };
      setItems(annotations);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const docTitleFor = (id: string) =>
    documents.find((d) => d.id === id)?.title ?? "Unknown document";

  async function updateNote(id: number, note: string) {
    await fetch(`/api/annotations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    });
  }

  async function remove(id: number) {
    await fetch(`/api/annotations/${id}`, { method: "DELETE" });
    setItems((m) => m.filter((a) => a.id !== id));
  }

  return (
    <section className="flex-1 flex flex-col min-w-0">
      <header className="px-4 md:px-6 py-4 border-b border-[var(--border)] flex items-center gap-3">
        <button
          onClick={onOpenSidebar}
          className="md:hidden -ml-1 p-1.5 text-[var(--muted)] hover:text-zinc-100 rounded-md"
          aria-label="Open sidebar"
        >
          <MenuIcon className="w-5 h-5" />
        </button>
        <div>
          <h2 className="text-sm font-medium flex items-center gap-2">
            <BookmarkIcon className="w-4 h-4 text-[var(--accent)]" filled />
            Saved passages
          </h2>
          <p className="text-[11px] text-[var(--muted)] mt-0.5">
            {loading
              ? "Loading…"
              : `${items.length} saved · click a row to jump to its document`}
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-6">
        {!loading && items.length === 0 && (
          <div className="max-w-xl mx-auto text-center text-sm text-[var(--muted)] py-16">
            <BookmarkIcon className="mx-auto w-8 h-8 text-[var(--accent)]/40 mb-3" />
            <p>No saved passages yet.</p>
            <p className="mt-1.5">
              Click the bookmark icon on any source in a chat answer to save it
              here.
            </p>
          </div>
        )}

        <ul className="max-w-3xl mx-auto space-y-4">
          {items.map((a) => (
            <li
              key={a.id}
              className="rounded-2xl border border-[var(--border)] bg-zinc-900/40 overflow-hidden"
            >
              <header className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)]">
                <button
                  onClick={() => onJumpToDocument(a.document_id)}
                  className="text-left text-xs font-medium text-zinc-300 hover:text-zinc-50 transition-colors truncate"
                >
                  {docTitleFor(a.document_id)} · page {a.page_number ?? "?"}
                </button>
                <button
                  onClick={() => remove(a.id)}
                  className="text-[var(--muted)] hover:text-red-400 transition-colors"
                  aria-label="Remove annotation"
                >
                  <TrashIcon className="w-3.5 h-3.5" />
                </button>
              </header>
              <div className="px-5 py-3 text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap">
                {a.text}
              </div>
              <NoteEditor
                initial={a.note ?? ""}
                onSave={(note) => updateNote(a.id, note)}
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function NoteEditor({
  initial,
  onSave,
}: {
  initial: string;
  onSave: (n: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const [dirty, setDirty] = useState(false);

  return (
    <div className="border-t border-[var(--border)] bg-zinc-950/40 px-5 py-3">
      <label className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
        Note
      </label>
      <textarea
        rows={2}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setDirty(true);
        }}
        onBlur={() => {
          if (dirty) {
            onSave(value);
            setDirty(false);
          }
        }}
        placeholder="Add a note for your future self…"
        className="mt-1 w-full bg-transparent outline-none text-xs text-zinc-200 resize-none placeholder:text-zinc-600"
      />
    </div>
  );
}
