"use client";

import { useEffect, useRef, useState } from "react";
import type { DocumentRow } from "@/lib/api/types";
import {
  CloseIcon,
  FileIcon,
  SearchIcon,
  SparkleIcon,
  TrashIcon,
  UploadIcon,
} from "@/components/icons";
import { BookmarkIcon } from "@/components/icons-extra";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast";

type Props = {
  documents: DocumentRow[];
  activeDocumentId: string | null;
  view: "chat" | "saved";
  annotationCount: number;
  onSelect: (id: string | null) => void;
  onSelectSaved: () => void;
  onUploaded: (newDocumentId?: string) => void;
  onDeleted: () => void;
  open: boolean;
  onClose: () => void;
  loadingDocuments: boolean;
};

export function Sidebar({
  documents,
  activeDocumentId,
  view,
  annotationCount,
  onSelect,
  onSelectSaved,
  onUploaded,
  onDeleted,
  open,
  onClose,
  loadingDocuments,
}: Props) {
  const [filter, setFilter] = useState("");
  const filterRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        filterRef.current?.focus();
        filterRef.current?.select();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const visibleDocs = filter.trim()
    ? documents.filter((d) =>
        d.title.toLowerCase().includes(filter.trim().toLowerCase()),
      )
    : documents;
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadName, setUploadName] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const toast = useToast();

  async function handleFile(file: File) {
    setUploading(true);
    setUploadName(file.name);

    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch("/api/documents", { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error ?? `Upload failed (${res.status})`);
      }
      onUploaded(typeof body.documentId === "string" ? body.documentId : undefined);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
      setUploadName(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const { id } = pendingDelete;
    setPendingDelete(null);
    const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
    if (res.ok) {
      if (activeDocumentId === id) onSelect(null);
      onDeleted();
    }
  }

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className={`fixed inset-0 bg-black/55 backdrop-blur-sm z-30 md:hidden transition-opacity ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />
      <aside
        className={`fixed md:static inset-y-0 left-0 z-40 w-72 shrink-0 border-r border-[var(--border)]
                    bg-zinc-950/95 md:bg-zinc-950/60 backdrop-blur-sm flex flex-col
                    transition-transform duration-200 ease-out
                    ${open ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}
      >
      <div className="px-5 py-5 border-b border-[var(--border)] bg-gradient-to-b from-[var(--accent)]/[0.08] to-transparent flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="relative flex items-center justify-center w-7 h-7 rounded-lg bg-[var(--accent)]/15 border border-[var(--accent)]/30 shadow-[0_0_18px_rgba(96,165,250,0.35)]">
              <SparkleIcon className="w-4 h-4 text-[var(--accent)]" />
            </div>
            <h1 className="text-base font-semibold tracking-tight">
              Paper Summarizer
            </h1>
          </div>
          <p className="mt-2 text-xs text-[var(--muted)]">
            Ask your PDFs. Get cited answers.
          </p>
        </div>
        <button
          onClick={onClose}
          className="md:hidden text-[var(--muted)] hover:text-zinc-100 -mt-1"
          aria-label="Close sidebar"
        >
          <CloseIcon className="w-5 h-5" />
        </button>
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
                     bg-gradient-to-b from-[var(--accent)] to-blue-500 text-zinc-950
                     hover:brightness-110 shadow-[0_4px_18px_-6px_rgba(96,165,250,0.65)]
                     disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          <UploadIcon className="w-4 h-4" />
          {uploading ? "Indexing…" : "Upload PDF"}
        </button>
        {uploading && uploadName && (
          <p className="mt-2 text-xs text-[var(--muted)] truncate">
            <span className="pulse-dot">●</span> Processing {uploadName}…
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        <DocItem
          active={view === "chat" && activeDocumentId === null}
          onClick={() => onSelect(null)}
          title="All documents"
          subtitle={`${documents.length} indexed`}
        />
        <SavedItem
          active={view === "saved"}
          count={annotationCount}
          onClick={onSelectSaved}
        />
        <div className="flex items-center justify-between px-3 mt-3 mb-1">
          <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
            Library
          </span>
          <kbd className="hidden md:inline text-[10px] text-[var(--muted)] font-mono border border-[var(--border)] rounded px-1 py-0.5">
            ⌘K
          </kbd>
        </div>
        <div className="relative px-1 mb-1">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--muted)]" />
          <input
            ref={filterRef}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter library…"
            className="w-full bg-zinc-900/50 border border-[var(--border)] rounded-md pl-8 pr-2 py-1.5 text-xs
                       text-zinc-200 placeholder:text-zinc-600 outline-none
                       focus:border-[var(--accent)]/50 focus:bg-zinc-900/80 transition-colors"
          />
        </div>
        {loadingDocuments && documents.length === 0 ? (
          <DocSkeleton />
        ) : documents.length === 0 ? (
          <p className="px-3 py-2 text-xs text-[var(--muted)]">
            No documents yet. Upload one to start.
          </p>
        ) : visibleDocs.length === 0 ? (
          <p className="px-3 py-2 text-xs text-[var(--muted)]">
            No documents match &ldquo;{filter}&rdquo;.
          </p>
        ) : (
          visibleDocs.map((doc) => (
            <DocItem
              key={doc.id}
              active={view === "chat" && activeDocumentId === doc.id}
              onClick={() => onSelect(doc.id)}
              title={doc.title}
              subtitle={`${doc.page_count ?? "?"} pages · ${formatRelative(doc.created_at)}`}
              onDelete={() =>
                setPendingDelete({ id: doc.id, title: doc.title })
              }
            />
          ))
        )}
      </div>

      <div className="px-5 py-3 text-[11px] text-[var(--muted)] border-t border-[var(--border)]">
        Built with Next.js, Supabase, Voyage AI, Claude.
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this document?"
        description={
          pendingDelete
            ? `"${pendingDelete.title}" and all of its indexed chunks and conversations will be permanently removed. This can't be undone.`
            : ""
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </aside>
    </>
  );
}

function DocSkeleton() {
  return (
    <div className="space-y-1 px-1 py-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-2 px-2 py-2 rounded-md animate-pulse"
        >
          <div className="w-4 h-4 rounded bg-zinc-800/80 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="h-3 bg-zinc-800/80 rounded w-3/4" />
            <div className="mt-1.5 h-2 bg-zinc-800/60 rounded w-1/2" />
          </div>
        </div>
      ))}
    </div>
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
      className={`group relative flex items-center gap-2 rounded-md px-3 py-2 cursor-pointer transition-colors
                  ${
                    active
                      ? "bg-[var(--accent)]/12 ring-1 ring-inset ring-[var(--accent)]/30"
                      : "hover:bg-zinc-900/60"
                  }`}
      onClick={onClick}
    >
      {active && (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-[var(--accent)]" />
      )}
      <FileIcon
        className={`w-4 h-4 shrink-0 ${active ? "text-[var(--accent)]" : "text-[var(--muted)]"}`}
      />
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

function SavedItem({
  active,
  count,
  onClick,
}: {
  active: boolean;
  count: number;
  onClick: () => void;
}) {
  return (
    <div
      className={`group relative flex items-center gap-2 rounded-md px-3 py-2 cursor-pointer transition-colors mt-1
                  ${
                    active
                      ? "bg-[var(--accent)]/12 ring-1 ring-inset ring-[var(--accent)]/30"
                      : "hover:bg-zinc-900/60"
                  }`}
      onClick={onClick}
    >
      {active && (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-[var(--accent)]" />
      )}
      <BookmarkIcon
        className={`w-4 h-4 shrink-0 ${
          active ? "text-[var(--accent)]" : "text-[var(--muted)]"
        }`}
        filled={active}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Saved passages</p>
        <p className="text-[11px] text-[var(--muted)]">
          {count} saved
        </p>
      </div>
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
