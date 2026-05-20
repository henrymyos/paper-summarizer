"use client";

import { useRef, useState } from "react";
import type { DocumentRow } from "@/lib/api/types";
import { FileIcon, SparkleIcon, TrashIcon, UploadIcon } from "@/components/icons";

type Props = {
  documents: DocumentRow[];
  activeDocumentId: string | null;
  onSelect: (id: string | null) => void;
  onUploaded: () => void;
  onDeleted: () => void;
};

export function Sidebar({
  documents,
  activeDocumentId,
  onSelect,
  onUploaded,
  onDeleted,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadName, setUploadName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setUploading(true);
    setUploadName(file.name);

    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch("/api/documents", { method: "POST", body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Upload failed (${res.status})`);
      }
      onUploaded();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
      setUploadName(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleDelete(id: string, title: string) {
    if (!confirm(`Delete "${title}"? This can't be undone.`)) return;
    const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
    if (res.ok) {
      if (activeDocumentId === id) onSelect(null);
      onDeleted();
    }
  }

  return (
    <aside className="w-72 shrink-0 border-r border-[var(--border)] bg-[var(--background)] flex flex-col">
      <div className="px-5 py-5 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <SparkleIcon className="w-5 h-5 text-[var(--accent)]" />
          <h1 className="text-base font-semibold tracking-tight">
            Paper Summarizer
          </h1>
        </div>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Ask your PDFs. Get cited answers.
        </p>
      </div>

      <div className="px-3 py-3 border-b border-[var(--border)]">
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        <button
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-md
                     bg-[var(--foreground)] text-[var(--background)]
                     hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <UploadIcon className="w-4 h-4" />
          {uploading ? "Indexing…" : "Upload PDF"}
        </button>
        {uploading && uploadName && (
          <p className="mt-2 text-xs text-[var(--muted)] truncate">
            <span className="pulse-dot">●</span> Processing {uploadName}…
          </p>
        )}
        {error && (
          <p className="mt-2 text-xs text-red-400 break-words">{error}</p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        <DocItem
          active={activeDocumentId === null}
          onClick={() => onSelect(null)}
          title="All documents"
          subtitle={`${documents.length} indexed`}
        />
        <div className="px-3 mt-3 mb-1 text-[10px] uppercase tracking-wider text-[var(--muted)]">
          Library
        </div>
        {documents.length === 0 ? (
          <p className="px-3 py-2 text-xs text-[var(--muted)]">
            No documents yet. Upload one to start.
          </p>
        ) : (
          documents.map((doc) => (
            <DocItem
              key={doc.id}
              active={activeDocumentId === doc.id}
              onClick={() => onSelect(doc.id)}
              title={doc.title}
              subtitle={`${doc.page_count ?? "?"} pages · ${formatRelative(doc.created_at)}`}
              onDelete={() => handleDelete(doc.id, doc.title)}
            />
          ))
        )}
      </div>

      <div className="px-5 py-3 text-[11px] text-[var(--muted)] border-t border-[var(--border)]">
        Built with Next.js, Supabase, Voyage AI, Claude.
      </div>
    </aside>
  );
}

function DocItem({
  active,
  onClick,
  title,
  subtitle,
  onDelete,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
  onDelete?: () => void;
}) {
  return (
    <div
      className={`group flex items-center gap-2 rounded-md px-3 py-2 cursor-pointer transition-colors
                  ${active ? "bg-zinc-800/80" : "hover:bg-zinc-900/60"}`}
      onClick={onClick}
    >
      <FileIcon className="w-4 h-4 shrink-0 text-[var(--muted)]" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{title}</p>
        <p className="text-[11px] text-[var(--muted)] truncate">{subtitle}</p>
      </div>
      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="opacity-0 group-hover:opacity-100 text-[var(--muted)] hover:text-red-400 transition-opacity"
          aria-label="Delete document"
        >
          <TrashIcon className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
