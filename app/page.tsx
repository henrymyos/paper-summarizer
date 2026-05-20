"use client";

import { useCallback, useEffect, useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { Chat } from "@/components/chat";
import type { DocumentRow } from "@/lib/api/types";

export default function Home() {
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/documents", { cache: "no-store" });
    if (!res.ok) return;
    const { documents } = (await res.json()) as { documents: DocumentRow[] };
    setDocuments(documents);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const active = documents.find((d) => d.id === activeId) ?? null;

  return (
    <div className="h-screen flex">
      <Sidebar
        documents={documents}
        activeDocumentId={activeId}
        onSelect={setActiveId}
        onUploaded={refresh}
        onDeleted={refresh}
      />
      <Chat activeDocument={active} documents={documents} />
    </div>
  );
}
