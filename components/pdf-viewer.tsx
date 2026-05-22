"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { CloseIcon } from "@/components/icons";

// pdf.js needs a worker. Pull it from the unpkg CDN so we don't need to
// copy the worker file into /public.
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

type Props = {
  open: boolean;
  documentId: string | null;
  page: number;
  highlightText?: string;
  onClose: () => void;
};

export function PdfViewer({
  open,
  documentId,
  page,
  highlightText,
  onClose,
}: Props) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [current, setCurrent] = useState(page);
  const [width, setWidth] = useState(720);
  const [mounted, setMounted] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  // Reset to the requested page whenever the viewer is reopened.
  useEffect(() => {
    if (open) {
      setCurrent(page);
      setErr(null);
    }
  }, [open, page, documentId]);

  // Size the page to the container width.
  useEffect(() => {
    if (!open) return;
    function measure() {
      if (containerRef.current) {
        // Subtract a small horizontal pad so the page doesn't bleed to the
        // edge of the modal.
        const w = containerRef.current.clientWidth - 24;
        setWidth(Math.max(280, Math.min(960, w)));
      }
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open]);

  // Esc closes.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") setCurrent((c) => Math.max(1, c - 1));
      if (e.key === "ArrowRight")
        setCurrent((c) => (numPages ? Math.min(numPages, c + 1) : c + 1));
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, numPages, onClose]);

  // Highlight any text-layer span that includes the highlight text. Runs on
  // each page render via a MutationObserver on the page container.
  const highlightTerms = useMemo(() => {
    if (!highlightText) return [];
    // Use the first few significant words to find approximate matches —
    // exact matching often fails because pdf.js text layer breaks on spans.
    return highlightText
      .split(/\s+/)
      .filter((w) => w.length > 4)
      .slice(0, 8)
      .map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, ""));
  }, [highlightText]);

  function highlightPage(pageEl: HTMLElement | null) {
    if (!pageEl || highlightTerms.length === 0) return;
    const spans = pageEl.querySelectorAll<HTMLSpanElement>(
      ".react-pdf__Page__textContent span",
    );
    spans.forEach((span) => {
      const text = (span.textContent ?? "").toLowerCase();
      const stripped = text.replace(/[^a-z0-9]/g, "");
      if (stripped.length < 3) return;
      const hit = highlightTerms.some((t) => stripped.includes(t) && t.length >= 4);
      span.style.background = hit ? "rgba(96, 165, 250, 0.32)" : "";
      span.style.color = hit ? "#000" : "";
      span.style.borderRadius = hit ? "2px" : "";
    });
  }

  if (!open || !mounted || !documentId) return null;

  const pdfUrl = `/api/documents/${documentId}/pdf`;

  const ui = (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8"
    >
      <div
        className="absolute inset-0 bg-black/65 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        ref={containerRef}
        className="relative w-full max-w-4xl h-full bg-zinc-950/95 rounded-2xl border border-[var(--border)]
                   shadow-[0_20px_60px_-10px_rgba(0,0,0,0.7)] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--accent)]/60 to-transparent" />

        <header className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)] gap-3">
          <div className="text-xs text-[var(--muted)]">
            Page{" "}
            <span className="text-zinc-100 font-mono">
              {current}
              {numPages ? ` / ${numPages}` : ""}
            </span>
            {highlightTerms.length > 0 && (
              <span className="ml-3 text-[var(--accent)]">
                · highlighting cited passage
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrent((c) => Math.max(1, c - 1))}
              disabled={current <= 1}
              className="px-2 py-1 text-xs rounded-md border border-[var(--border)] text-zinc-200
                         hover:bg-zinc-800/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ← Prev
            </button>
            <button
              onClick={() =>
                setCurrent((c) => (numPages ? Math.min(numPages, c + 1) : c + 1))
              }
              disabled={!!numPages && current >= numPages}
              className="px-2 py-1 text-xs rounded-md border border-[var(--border)] text-zinc-200
                         hover:bg-zinc-800/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next →
            </button>
            <button
              onClick={onClose}
              className="ml-2 text-[var(--muted)] hover:text-zinc-100"
              aria-label="Close"
            >
              <CloseIcon className="w-4 h-4" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-3 flex items-start justify-center bg-zinc-900/30">
          {err ? (
            <div className="text-center text-sm text-[var(--muted)] py-16">
              {err}
            </div>
          ) : (
            <Document
              file={pdfUrl}
              onLoadSuccess={(pdf) => setNumPages(pdf.numPages)}
              onLoadError={(e) =>
                setErr(
                  `Couldn't load this PDF. ${
                    e?.message ?? ""
                  }`,
                )
              }
              loading={
                <div className="text-sm text-[var(--muted)] py-16">
                  Loading PDF…
                </div>
              }
            >
              <Page
                pageNumber={current}
                width={width}
                renderTextLayer={true}
                renderAnnotationLayer={false}
                onRenderTextLayerSuccess={() => {
                  // Walk the most recently rendered page DOM and apply highlights.
                  highlightPage(
                    containerRef.current?.querySelector(
                      ".react-pdf__Page",
                    ) as HTMLElement | null,
                  );
                }}
              />
            </Document>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(ui, document.body);
}
