"use client";

import { useEffect, useRef, useState } from "react";
import type { ApiChunk, ChatMessage, DocumentRow } from "@/lib/api/types";
import { CitedAnswer } from "@/components/cited-answer";
import { MenuIcon, SendIcon, SparkleIcon } from "@/components/icons";
import { BookIcon, LayersIcon, MessageIcon } from "@/components/icons-extra";
import { useToast } from "@/components/toast";
import { StructureView } from "@/components/structure-view";
import { ReferencesView } from "@/components/references-view";

type Tab = "chat" | "structure" | "references";

type Props = {
  activeDocument: DocumentRow | null;
  documents: DocumentRow[];
  savedChunkIds: Set<number>;
  onToggleSave: (chunk: ApiChunk) => void;
  onJumpToDocument: (id: string) => void;
  onOpenSidebar: () => void;
  onUsageChange?: () => void;
  onOpenSource?: (chunk: ApiChunk) => void;
};

export function Chat({
  activeDocument,
  documents,
  savedChunkIds,
  onToggleSave,
  onJumpToDocument,
  onOpenSidebar,
  onUsageChange,
  onOpenSource,
}: Props) {
  const [tab, setTab] = useState<Tab>("chat");
  const toast = useToast();
  useEffect(() => {
    // Reset to chat whenever the active document changes.
    setTab("chat");
  }, [activeDocument?.id]);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load persisted history whenever the active scope changes.
  useEffect(() => {
    let cancelled = false;
    setError(null);
    setMessages([]);

    const params = activeDocument?.id
      ? `?documentId=${encodeURIComponent(activeDocument.id)}`
      : "";

    (async () => {
      try {
        const res = await fetch(`/api/queries${params}`, { cache: "no-store" });
        if (!res.ok) return;
        const { queries } = (await res.json()) as {
          queries: {
            id: number;
            question: string;
            answer: string;
            chunks: ChatMessage extends { role: "assistant"; chunks: infer C }
              ? C
              : never;
          }[];
        };
        if (cancelled) return;

        const hydrated: ChatMessage[] = queries.flatMap((q) => [
          { role: "user", id: `u-${q.id}`, content: q.question },
          {
            role: "assistant",
            id: `a-${q.id}`,
            answer: q.answer,
            chunks: q.chunks,
          },
        ]);
        setMessages(hydrated);
      } catch {
        // Non-fatal — empty history is the same as a fresh thread.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeDocument?.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, busy]);

  async function submit() {
    const q = question.trim();
    if (!q || busy) return;

    const userMsg: ChatMessage = {
      role: "user",
      id: `u-${Date.now()}`,
      content: q,
    };
    const assistantId = `a-${Date.now()}`;
    setMessages((m) => [
      ...m,
      userMsg,
      { role: "assistant", id: assistantId, answer: "", chunks: [] },
    ]);
    setQuestion("");
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/ask/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q,
          documentId: activeDocument?.id ?? null,
        }),
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Ask failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let streamErr: string | null = null;

      // Batch token deltas with rAF so we don't re-render the markdown
      // tree for every single byte that arrives.
      let pending = "";
      let scheduled = false;
      const flush = () => {
        if (!pending) {
          scheduled = false;
          return;
        }
        const t = pending;
        pending = "";
        scheduled = false;
        setMessages((m) =>
          m.map((msg) =>
            msg.id === assistantId && msg.role === "assistant"
              ? { ...msg, answer: msg.answer + t }
              : msg,
          ),
        );
      };
      const schedule = () => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(flush);
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE events are separated by a blank line.
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const evt of events) {
          const dataLine = evt
            .split("\n")
            .find((l) => l.startsWith("data: "));
          if (!dataLine) continue;
          let parsed: {
            type: string;
            text?: string;
            chunks?: ApiChunk[];
            message?: string;
          };
          try {
            parsed = JSON.parse(dataLine.slice(6));
          } catch {
            continue;
          }

          if (parsed.type === "chunks" && parsed.chunks) {
            const cs = parsed.chunks;
            setMessages((m) =>
              m.map((msg) =>
                msg.id === assistantId && msg.role === "assistant"
                  ? { ...msg, chunks: cs }
                  : msg,
              ),
            );
          } else if (parsed.type === "token" && parsed.text) {
            pending += parsed.text;
            schedule();
          } else if (parsed.type === "error") {
            streamErr = parsed.message ?? "Ask failed.";
          }
        }
      }

      // Drain any pending tokens that hadn't flushed yet.
      if (pending) flush();

      if (streamErr) throw new Error(streamErr);

      // Usage was just persisted server-side; refresh the sidebar chip.
      onUsageChange?.();
    } catch (e) {
      setMessages((m) => m.filter((msg) => msg.id !== assistantId));
      const message = e instanceof Error ? e.message : "Ask failed.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  const hasDocuments = documents.length > 0;

  return (
    <section className="flex-1 flex flex-col min-w-0">
      <header className="px-4 md:px-6 py-4 border-b border-[var(--border)] flex items-center justify-between gap-3">
        <button
          onClick={onOpenSidebar}
          className="md:hidden -ml-1 p-1.5 text-[var(--muted)] hover:text-zinc-100 rounded-md"
          aria-label="Open sidebar"
        >
          <MenuIcon className="w-5 h-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-medium truncate">
            {activeDocument ? activeDocument.title : "All documents"}
          </h2>
          <p className="text-[11px] text-[var(--muted)] mt-0.5">
            {activeDocument
              ? `${activeDocument.page_count ?? "?"} pages`
              : `Asking across ${documents.length} document${documents.length === 1 ? "" : "s"}`}
          </p>
        </div>
        {activeDocument && (
          <nav className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-zinc-900/50 p-0.5">
            <TabButton
              icon={<MessageIcon className="w-3.5 h-3.5" />}
              label="Chat"
              active={tab === "chat"}
              onClick={() => setTab("chat")}
            />
            {(activeDocument.structure?.sections?.length ?? 0) +
              (activeDocument.structure?.figures?.length ?? 0) +
              (activeDocument.structure?.tables?.length ?? 0) >
              0 && (
              <TabButton
                icon={<LayersIcon className="w-3.5 h-3.5" />}
                label="Structure"
                active={tab === "structure"}
                onClick={() => setTab("structure")}
              />
            )}
            {(activeDocument.references?.length ?? 0) > 0 && (
              <TabButton
                icon={<BookIcon className="w-3.5 h-3.5" />}
                label="References"
                active={tab === "references"}
                onClick={() => setTab("references")}
              />
            )}
          </nav>
        )}
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 md:px-6 py-6">
        {tab === "structure" && activeDocument ? (
          <StructureView document={activeDocument} />
        ) : tab === "references" && activeDocument ? (
          <ReferencesView
            document={activeDocument}
            library={documents}
            onJumpToDocument={onJumpToDocument}
          />
        ) : messages.length === 0 ? (
          <EmptyState
            hasDocuments={hasDocuments}
            activeDocument={activeDocument}
            onPick={setQuestion}
          />
        ) : (
          <ul className="max-w-3xl mx-auto space-y-6">
            {messages.map((m) =>
              m.role === "user" ? (
                <li key={m.id} className="flex justify-end">
                  <div className="max-w-[80%] rounded-2xl rounded-br-md
                                  bg-gradient-to-br from-[var(--accent)]/25 to-blue-500/15
                                  border border-[var(--accent)]/30 text-zinc-50 px-4 py-2.5 text-sm
                                  shadow-[0_4px_22px_-10px_rgba(96,165,250,0.55)]">
                    {m.content}
                  </div>
                </li>
              ) : (
                <li key={m.id}>
                  <AnswerCard
                    answer={m.answer}
                    chunks={m.chunks}
                    savedChunkIds={savedChunkIds}
                    onToggleSave={onToggleSave}
                    onOpenSource={onOpenSource}
                  />
                </li>
              ),
            )}
            {error && (
              <li>
                <div className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                  {error}
                </div>
              </li>
            )}
          </ul>
        )}
      </div>

      {tab === "chat" && (
      <div className="border-t border-[var(--border)] px-4 py-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="max-w-3xl mx-auto flex items-end gap-2 bg-zinc-900/60 border border-[var(--border)] rounded-2xl
                     focus-within:border-[var(--accent)]/50 focus-within:shadow-[0_0_0_3px_rgba(96,165,250,0.12)]
                     transition-all px-3 py-2"
        >
          <textarea
            rows={1}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={
              hasDocuments
                ? "Ask anything about the selected document…"
                : "Upload a PDF to get started…"
            }
            disabled={!hasDocuments || busy}
            className="flex-1 resize-none bg-transparent outline-none text-sm py-1.5 placeholder:text-zinc-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!question.trim() || busy || !hasDocuments}
            className="shrink-0 flex items-center justify-center w-9 h-9 rounded-xl
                       bg-[var(--accent)] text-zinc-950 disabled:bg-zinc-700 disabled:text-zinc-500
                       hover:brightness-110 transition-all"
            aria-label="Send"
          >
            <SendIcon className="w-4 h-4" />
          </button>
        </form>
        <p className="max-w-3xl mx-auto mt-2 text-[11px] text-[var(--muted)] text-center">
          Answers are grounded in the retrieved passages. Click a citation to see the source.
        </p>
      </div>
      )}
    </section>
  );
}

function TabButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
        active
          ? "bg-[var(--accent)]/15 text-[var(--accent)]"
          : "text-zinc-400 hover:text-zinc-100"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function EmptyState({
  hasDocuments,
  activeDocument,
  onPick,
}: {
  hasDocuments: boolean;
  activeDocument: DocumentRow | null;
  onPick: (q: string) => void;
}) {
  const docSummary = activeDocument?.summary?.trim();
  const docQuestions =
    activeDocument?.suggested_questions?.filter((q) => q && q.trim().length > 0) ?? [];

  const fallbackSuggestions = [
    "Summarize this document in 3 bullet points.",
    "What is the main argument or claim?",
    "What methods or data are used?",
    "What are the limitations the authors mention?",
  ];

  const suggestions =
    docQuestions.length > 0 ? docQuestions : fallbackSuggestions;

  return (
    <div className="max-w-2xl mx-auto h-full flex flex-col items-center justify-center text-center pb-12">
      <div className="relative w-14 h-14 rounded-2xl bg-[var(--accent)]/15 border border-[var(--accent)]/30 flex items-center justify-center mb-4
                      shadow-[0_0_40px_-5px_rgba(96,165,250,0.55)]">
        <SparkleIcon className="w-7 h-7 text-[var(--accent)]" />
        <div className="absolute inset-0 rounded-2xl bg-[var(--accent)]/10 blur-xl -z-10" />
      </div>

      {activeDocument ? (
        <>
          <h3 className="text-lg font-medium">{activeDocument.title}</h3>
          {docSummary ? (
            <p className="mt-2 text-sm text-zinc-300 max-w-xl leading-relaxed">
              {docSummary}
            </p>
          ) : (
            <p className="mt-1.5 text-sm text-[var(--muted)] max-w-md">
              Ask a question — Claude will answer using passages from this document.
            </p>
          )}
        </>
      ) : (
        <>
          <h3 className="text-lg font-medium">
            {hasDocuments ? "Ask across your library" : "Upload a PDF to get started"}
          </h3>
          <p className="mt-1.5 text-sm text-[var(--muted)] max-w-md">
            {hasDocuments
              ? "Your question is embedded and matched against the most relevant passages across every document you've indexed. Claude answers using only those passages, with citations."
              : "Drop a research paper, textbook chapter, or any PDF. We'll parse, chunk, and embed it so you can ask grounded questions."}
          </p>
        </>
      )}

      {hasDocuments && (
        <>
          {activeDocument && docQuestions.length > 0 && (
            <p className="mt-6 text-[10px] uppercase tracking-wider text-[var(--muted)]">
              Suggested for this document
            </p>
          )}
          <div className={`${activeDocument && docQuestions.length > 0 ? "mt-2" : "mt-6"} grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg`}>
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => onPick(s)}
                className="text-left text-xs px-3 py-2.5 rounded-lg border border-[var(--border)] bg-zinc-900/40
                           hover:bg-[var(--accent)]/10 hover:border-[var(--accent)]/40 hover:text-zinc-50
                           transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function AnswerCard({
  answer,
  chunks,
  savedChunkIds,
  onToggleSave,
  onOpenSource,
}: {
  answer: string;
  chunks: ApiChunk[];
  savedChunkIds: Set<number>;
  onToggleSave: (chunk: ApiChunk) => void;
  onOpenSource?: (chunk: ApiChunk) => void;
}) {
  const isEmpty = answer.length === 0;
  return (
    <div className="relative rounded-2xl border border-[var(--border)] bg-zinc-900/40 px-5 py-4 overflow-hidden">
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--accent)]/60 to-transparent" />
      {isEmpty ? (
        <div className="flex items-center gap-3 text-sm text-[var(--muted)] py-1">
          <span className="flex gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] pulse-dot" style={{ animationDelay: "0ms" }} />
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] pulse-dot" style={{ animationDelay: "200ms" }} />
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] pulse-dot" style={{ animationDelay: "400ms" }} />
          </span>
          {chunks.length > 0
            ? "Drafting answer from the retrieved passages…"
            : "Searching passages…"}
        </div>
      ) : (
        <CitedAnswer
          answer={answer}
          chunks={chunks}
          savedChunkIds={savedChunkIds}
          onToggleSave={onToggleSave}
          onOpenSource={onOpenSource}
        />
      )}
    </div>
  );
}
