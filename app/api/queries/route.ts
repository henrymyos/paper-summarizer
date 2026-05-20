import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserId } from "@/lib/user";

export const runtime = "nodejs";

type QueryRow = {
  id: number;
  document_id: string | null;
  question: string;
  answer: string | null;
  cited_chunk_ids: number[] | null;
  created_at: string;
};

type ChunkRow = {
  id: number;
  document_id: string;
  page_number: number | null;
  text: string;
};

export async function GET(req: Request) {
  const userId = getUserId();
  const url = new URL(req.url);
  const documentId = url.searchParams.get("documentId");

  const admin = createAdminClient();
  let query = admin
    .from("queries")
    .select("id, document_id, question, answer, cited_chunk_ids, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (documentId) {
    query = query.eq("document_id", documentId);
  } else {
    query = query.is("document_id", null);
  }

  const { data: rows, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const queries = (rows ?? []) as QueryRow[];

  // Batch-fetch every chunk referenced by any of these queries.
  const allIds = Array.from(
    new Set(queries.flatMap((q) => q.cited_chunk_ids ?? [])),
  );

  let chunkMap = new Map<number, ChunkRow>();
  if (allIds.length > 0) {
    const { data: chunks, error: chunksErr } = await admin
      .from("chunks")
      .select("id, document_id, page_number, text")
      .in("id", allIds);
    if (chunksErr)
      return NextResponse.json({ error: chunksErr.message }, { status: 500 });
    chunkMap = new Map((chunks ?? []).map((c) => [c.id, c as ChunkRow]));
  }

  const out = queries.map((q) => ({
    id: q.id,
    question: q.question,
    answer: q.answer ?? "",
    created_at: q.created_at,
    chunks: (q.cited_chunk_ids ?? [])
      .map((id) => {
        const c = chunkMap.get(id);
        if (!c) return null;
        return {
          id: c.id,
          document_id: c.document_id,
          page_number: c.page_number,
          chunk_index: 0,
          text: c.text,
          // Similarity isn't persisted; restored history omits it. The UI
          // hides the score when null.
          similarity: null as number | null,
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null),
  }));

  return NextResponse.json({ queries: out });
}
