import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { parsePdf } from "@/lib/pdf";
import { chunkPages } from "@/lib/chunking";
import { embed } from "@/lib/embeddings";

export type IndexResult = {
  documentId: string;
  title: string;
  pageCount: number;
  chunkCount: number;
};

/**
 * Parse → chunk → embed → store. Server-only.
 *
 * Uses the service-role client because we trust the caller (a server-side
 * route handler that runs after its own auth check). Documents are
 * attributed to `userId` so RLS-aware reads on the anon client still work.
 */
export async function indexPdf(
  data: Uint8Array,
  { title, userId }: { title: string; userId: string },
): Promise<IndexResult> {
  const { pages, pageCount } = await parsePdf(data);
  const chunks = chunkPages(pages);

  if (chunks.length === 0) {
    throw new Error(
      "No extractable text in this PDF (it might be scanned images — OCR not yet supported).",
    );
  }

  // Embed in batches of 64 to stay well under Voyage's per-call limit.
  const BATCH = 64;
  const vectors: number[][] = [];
  for (let i = 0; i < chunks.length; i += BATCH) {
    const slice = chunks.slice(i, i + BATCH).map((c) => c.text);
    const v = await embed(slice, "document");
    vectors.push(...v);
  }

  const admin = createAdminClient();

  const { data: doc, error: docErr } = await admin
    .from("documents")
    .insert({ user_id: userId, title, page_count: pageCount })
    .select()
    .single();
  if (docErr || !doc) throw docErr ?? new Error("insert documents failed");

  const rows = chunks.map((c, i) => ({
    document_id: doc.id as string,
    page_number: c.pageNumber ?? null,
    chunk_index: c.chunkIndex,
    text: c.text,
    embedding: vectors[i] as unknown as string,
  }));

  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await admin.from("chunks").insert(rows.slice(i, i + 200));
    if (error) {
      // Best-effort cleanup so we don't leave an empty document hanging around.
      await admin.from("documents").delete().eq("id", doc.id);
      throw error;
    }
  }

  return {
    documentId: doc.id as string,
    title,
    pageCount,
    chunkCount: chunks.length,
  };
}
