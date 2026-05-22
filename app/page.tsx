"use client";

import { useCallback, useEffect, useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { Chat } from "@/components/chat";
import { SavedPassages } from "@/components/saved-passages";
import { ToastProvider, useToast } from "@/components/toast";
import type { Annotation, ApiChunk, DocumentRow } from "@/lib/api/types";

type View = "chat" | "saved";

function PageInner() {
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [loadingDocuments, setLoadingDocuments] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [view, setView] = useState<View>("chat");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const toast = useToast();

  const refreshDocs = useCallback(async () => {
    setLoadingDocuments(true);
    const res = await fetch("/api/documents", { cache: "no-store" });
    if (!res.ok) {
      setLoadingDocuments(false);
      return;
    }
    const { documents } = (await res.json()) as { documents: DocumentRow[] };
    setDocuments(documents);
    setLoadingDocuments(false);
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
    const existing = annotations.find((a) => a.chunk_id === chunk.id);
    if (existing) {
      setAnnotations((m) => m.filter((a) => a.id !== existing.id));
      const res = await fetch(`/api/annotations/${existing.id}`, {
        method: "DELETE",
      });
      if (!res.ok) toast.error("Couldn't remove from saved.");
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
      toast.success("Passage saved");
    } else {
      toast.error("Couldn't save passage.");
    }
  }

  function jumpToDocument(id: string) {
    setView("chat");
    setActiveId(id);
    setSidebarOpen(false);
  }

  return (
    <div className="h-screen flex">
      <Sidebar
        documents={documents}
        activeDocumentId={view === "chat" ? activeId : null}
        view={view}
        annotationCount={annotations.length}
        loadingDocuments={loadingDocuments}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onSelect={(id) => {
          setView("chat");
          setActiveId(id);
          setSidebarOpen(false);
        }}
        onSelectSaved={() => {
          setView("saved");
          setSidebarOpen(false);
        }}
        onUploaded={async (newDocumentId) => {
          await refreshDocs();
          if (newDocumentId) {
            setView("chat");
            setActiveId(newDocumentId);
            setSidebarOpen(false);
            toast.success("Document indexed");
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
          onOpenSidebar={() => setSidebarOpen(true)}
        />
      ) : (
        <Chat
          activeDocument={active}
          documents={documents}
          savedChunkIds={savedChunkIds}
          onToggleSave={toggleSave}
          onJumpToDocument={jumpToDocument}
          onOpenSidebar={() => setSidebarOpen(true)}
        />
      )}
    </div>
  );
}

export default function Home() {
  return (
    <ToastProvider>
      <PageInner />
    </ToastProvider>
  );
}
