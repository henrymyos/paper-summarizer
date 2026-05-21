"use client";

import { useEffect, useRef } from "react";

type Props = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onCancel,
}: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    // Focus the confirm button so Enter triggers it.
    confirmRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Modal card */}
      <div
        className="relative w-[min(420px,calc(100vw-2rem))] rounded-2xl border border-[var(--border)]
                   bg-zinc-950/95 shadow-[0_20px_60px_-10px_rgba(0,0,0,0.7)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--accent)]/60 to-transparent" />
        <div className="px-6 py-5">
          <h2 id="confirm-title" className="text-base font-semibold text-zinc-50">
            {title}
          </h2>
          <p className="mt-1.5 text-sm text-zinc-400 leading-relaxed">
            {description}
          </p>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--border)] bg-zinc-900/40">
          <button
            type="button"
            onClick={onCancel}
            className="px-3.5 py-1.5 text-sm rounded-md border border-[var(--border)] text-zinc-200
                       hover:bg-zinc-800/60 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className={`px-3.5 py-1.5 text-sm rounded-md font-medium transition-all
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
    </div>
  );
}
