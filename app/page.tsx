"use client";

import { useCallback, useEffect, useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { Chat } from "@/components/chat";
import { SavedPassages } from "@/components/saved-passages";
import type { Annotation, ApiChunk, DocumentRow } from "@/lib/api/types";

type View = "chat" | "saved";

export default function Home() {
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [view, setView] = useState<View>("chat");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);

  const refreshDocs = useCallback(async () => {
    const res = await fetch("/api/documents", { cache: "no-store" });
    if (!res.ok) return;
    const { documents } = (await res.json()) as { documents: DocumentRow[] };
    setDocuments(documents);
  }, []);

  const refreshAnnotations = useCallback(async () => {
    const res = await fetch("/api/annotations", { cache: "no-store" });
    if (!res.ok) return;
    const { annotations } = (await res.json()) as { annotations: Annotation[] };
    setAnnotations(annotations);
  }, []);

  useEffect(() => {
    refreshDocs();
    refreshAnnotations();
  }, [refreshDocs, refreshAnnotations]);

  const active = documents.find((d) => d.id === activeId) ?? null;
  const savedChunkIds = new Set(
    annotations
      .map((a) => a.chunk_id)
      .filter((id): id is number => typeof id === "number"),
  );

  async function toggleSave(chunk: ApiChunk) {
    // Find an existing annotation with this chunk_id.
    const existing = annotations.find((a) => a.chunk_id === chunk.id);
    if (existing) {
      // Optimistic remove.
      setAnnotations((m) => m.filter((a) => a.id !== existing.id));
      await fetch(`/api/annotations/${existing.id}`, { method: "DELETE" });
      return;
    }
    const res = await fetch("/api/annotations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        document_id: chunk.document_id,
        chunk_id: chunk.id,
        page_number: chunk.page_number,
        text: chunk.text,
      }),
    });
    if (res.ok) {
      const { annotation } = (await res.json()) as { annotation: Annotation };
      setAnnotations((m) => [annotation, ...m]);
    }
  }

  function jumpToDocument(id: string) {
    setView("chat");
    setActiveId(id);
  }

  return (
    <div className="h-screen flex">
      <Sidebar
        documents={documents}
        activeDocumentId={view === "chat" ? activeId : null}
        view={view}
        annotationCount={annotations.length}
        onSelect={(id) => {
          setView("chat");
          setActiveId(id);
        }}
        onSelectSaved={() => setView("saved")}
        onUploaded={async (newDocumentId) => {
          await refreshDocs();
          if (newDocumentId) {
            setView("chat");
            setActiveId(newDocumentId);
          }
        }}
        onDeleted={async () => {
          await refreshDocs();
          await refreshAnnotations();
        }}
      />
      {view === "saved" ? (
        <SavedPassages
          documents={documents}
          onJumpToDocument={jumpToDocument}
        />
      ) : (
        <Chat
          activeDocument={active}
          documents={documents}
          savedChunkIds={savedChunkIds}
          onToggleSave={toggleSave}
          onJumpToDocument={jumpToDocument}
        />
      )}
    </div>
  );
}
