"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  anchor: { top: number; left: number } | null;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * A small confirmation popover anchored next to a clicked element.
 * Portaled to <body> so it escapes any ancestor containing block.
 */
export function ConfirmPopover({
  open,
  anchor,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onCancel,
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    function onClickOutside(e: MouseEvent) {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        onCancel();
      }
    }

    document.addEventListener("keydown", onKey);
    // Defer the mousedown listener by a tick so the click that opened the
    // popover doesn't immediately close it.
    const id = window.setTimeout(() => {
      document.addEventListener("mousedown", onClickOutside);
    }, 0);

    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClickOutside);
      window.clearTimeout(id);
    };
  }, [open, onCancel]);

  if (!open || !mounted || !anchor) return null;

  // Keep the popover on screen vertically.
  const margin = 8;
  const cardHeight = 200; // approximate; just used to nudge upward if needed
  const top = Math.min(
    Math.max(margin, anchor.top),
    typeof window !== "undefined" ? window.innerHeight - cardHeight - margin : anchor.top,
  );

  const popover = (
    <div
      ref={cardRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby="confirm-popover-title"
      className="fixed z-50 w-[320px] rounded-2xl border border-[var(--border)] bg-zinc-950/95
                 shadow-[0_20px_60px_-10px_rgba(0,0,0,0.7)] overflow-hidden
                 animate-[popover-in_120ms_ease-out]"
      style={{ top, left: anchor.left }}
    >
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--accent)]/60 to-transparent" />
      <div className="px-5 py-4">
        <h2 id="confirm-popover-title" className="text-sm font-semibold text-zinc-50">
          {title}
        </h2>
        <p className="mt-1.5 text-xs text-zinc-400 leading-relaxed">
          {description}
        </p>
      </div>
      <div className="flex items-center justify-end gap-2 px-4 py-2.5 border-t border-[var(--border)] bg-zinc-900/40">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-xs rounded-md border border-[var(--border)] text-zinc-200
                     hover:bg-zinc-800/60 transition-colors"
        >
          {cancelLabel}
        </button>
        <button
          ref={confirmRef}
          type="button"
          onClick={onConfirm}
          className={`px-3 py-1.5 text-xs rounded-md font-medium transition-all
                      ${
                        destructive
                          ? "bg-red-500/90 text-zinc-50 hover:bg-red-500 shadow-[0_4px_16px_-6px_rgba(239,68,68,0.6)]"
                          : "bg-[var(--accent)] text-zinc-950 hover:brightness-110"
                      }`}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );

  return createPortal(popover, document.body);
}
