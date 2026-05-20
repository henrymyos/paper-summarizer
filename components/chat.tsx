"use client";

import { useEffect, useRef, useState } from "react";
import type {
  ApiChunk,
  AskResponse,
  ChatMessage,
  DocumentRow,
} from "@/lib/api/types";
import { CitedAnswer } from "@/components/cited-answer";
import { SendIcon, SparkleIcon } from "@/components/icons";

type Props = {
  activeDocument: DocumentRow | null;
  documents: DocumentRow[];
};

export function Chat({ activeDocument, documents }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset history when the scope changes.
  useEffect(() => {
    setMessages([]);
    setError(null);
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
    setMessages((m) => [...m, userMsg]);
    setQuestion("");
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q,
          documentId: activeDocument?.id ?? null,
        }),
      });
      const data: AskResponse & { error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Ask failed (${res.status})`);

      const asst: ChatMessage = {
        role: "assistant",
        id: `a-${Date.now()}`,
        answer: data.answer,
        chunks: data.chunks,
      };
      setMessages((m) => [...m, asst]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ask failed.");
    } finally {
      setBusy(false);
    }
  }

  const hasDocuments = documents.length > 0;

  return (
    <section className="flex-1 flex flex-col min-w-0">
      <header className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
        <div className="min-w-0">
          <h2 className="text-sm font-medium truncate">
            {activeDocument ? activeDocument.title : "All documents"}
          </h2>
          <p className="text-[11px] text-[var(--muted)] mt-0.5">
            {activeDocument
              ? `${activeDocument.page_count ?? "?"} pages`
              : `Asking across ${documents.length} document${documents.length === 1 ? "" : "s"}`}
          </p>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6">
        {messages.length === 0 ? (
          <EmptyState hasDocuments={hasDocuments} onPick={setQuestion} />
        ) : (
          <ul className="max-w-3xl mx-auto space-y-6">
            {messages.map((m) =>
              m.role === "user" ? (
                <li key={m.id} className="flex justify-end">
                  <div className="max-w-[80%] rounded-2xl rounded-br-md bg-zinc-800 text-zinc-100 px-4 py-2.5 text-sm">
                    {m.content}
                  </div>
                </li>
              ) : (
                <li key={m.id}>
                  <AnswerCard answer={m.answer} chunks={m.chunks} />
                </li>
              ),
            )}
            {busy && (
              <li>
                <ThinkingCard />
              </li>
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

      <div className="border-t border-[var(--border)] px-4 py-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="max-w-3xl mx-auto flex items-end gap-2 bg-zinc-900/60 border border-[var(--border)] rounded-2xl
                     focus-within:border-zinc-600 transition-colors px-3 py-2"
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
    </section>
  );
}

function EmptyState({
  hasDocuments,
  onPick,
}: {
  hasDocuments: boolean;
  onPick: (q: string) => void;
}) {
  const suggestions = [
    "Summarize this document in 3 bullet points.",
    "What is the main argument or claim?",
    "What methods or data are used?",
    "What are the limitations the authors mention?",
  ];

  return (
    <div className="max-w-2xl mx-auto h-full flex flex-col items-center justify-center text-center pb-12">
      <div className="w-12 h-12 rounded-2xl bg-[var(--accent)]/10 border border-[var(--accent)]/20 flex items-center justify-center mb-4">
        <SparkleIcon className="w-6 h-6 text-[var(--accent)]" />
      </div>
      <h3 className="text-lg font-medium">
        {hasDocuments ? "Ask a question" : "Upload a PDF to get started"}
      </h3>
      <p className="mt-1.5 text-sm text-[var(--muted)] max-w-md">
        {hasDocuments
          ? "Your question is embedded and matched against the most relevant passages. Claude answers using only those passages, with citations."
          : "Drop a research paper, textbook chapter, or any PDF. We'll parse, chunk, and embed it so you can ask grounded questions."}
      </p>
      {hasDocuments && (
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => onPick(s)}
              className="text-left text-xs px-3 py-2.5 rounded-lg border border-[var(--border)] bg-zinc-900/40 hover:bg-zinc-900 hover:border-zinc-700 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AnswerCard({ answer, chunks }: { answer: string; chunks: ApiChunk[] }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-zinc-900/40 px-5 py-4">
      <CitedAnswer answer={answer} chunks={chunks} />
    </div>
  );
}

function ThinkingCard() {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-zinc-900/40 px-5 py-4 flex items-center gap-3 text-sm text-[var(--muted)]">
      <span className="flex gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 pulse-dot" style={{ animationDelay: "0ms" }} />
        <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 pulse-dot" style={{ animationDelay: "200ms" }} />
        <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 pulse-dot" style={{ animationDelay: "400ms" }} />
      </span>
      Searching passages and drafting an answer…
    </div>
  );
}
