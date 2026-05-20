import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { embed } from "@/lib/embeddings";
import { generateAnswer, type RetrievedChunk } from "@/lib/answer";

export type AskResult = {
  answer: string;
  chunks: RetrievedChunk[];
};

/** Embed question → top-k similarity search → grounded answer. */
export async function ask(
  question: string,
  opts: { documentId?: string | null; k?: number; userId: string },
): Promise<AskResult> {
  const k = opts.k ?? 5;
  const [qVec] = await embed([question], "query");
  const admin = createAdminClient();

  const { data, error } = await admin.rpc("match_chunks", {
    query_embedding: qVec as unknown as string,
    match_count: k,
    filter_document_id: opts.documentId ?? null,
  });
  if (error) throw error;

  const chunks = (data ?? []) as RetrievedChunk[];

  if (chunks.length === 0) {
    return {
      answer:
        "I couldn't find any indexed content to answer that. Upload a PDF first.",
      chunks: [],
    };
  }

  const answer = await generateAnswer(question, chunks);

  // Best-effort persistence of the conversation history.
  await admin.from("queries").insert({
    user_id: opts.userId,
    document_id: opts.documentId ?? null,
    question,
    answer,
    cited_chunk_ids: chunks.map((c) => c.id),
  });

  return { answer, chunks };
}
