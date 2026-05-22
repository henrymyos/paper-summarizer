import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { embed } from "@/lib/embeddings";
import { rerank } from "@/lib/rerank";
import { streamAnswer } from "@/lib/answer-stream";
import type { RetrievedChunk } from "@/lib/answer";
import { getUserId } from "@/lib/user";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  question: z.string().min(1).max(2000),
  documentId: z.string().uuid().nullable().optional(),
  k: z.number().int().min(1).max(20).optional(),
});

export async function POST(req: Request) {
  const userId = await getUserId();
  const raw = await req.json().catch(() => null);
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: "Invalid request body." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const { question, documentId, k } = parsed.data;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        // Two-stage retrieval: pull a wider candidate set from pgvector
        // (cheap cosine similarity) then rerank with Voyage's cross-encoder
        // to get a sharper top-k. Falls back to similarity ordering if the
        // rerank call fails so we never block the user.
        const finalK = k ?? 5;
        const candidateK = Math.max(20, finalK * 4);

        const [qVec] = await embed([question], "query");
        const admin = createAdminClient();
        const { data, error } = await admin.rpc("match_chunks", {
          query_embedding: qVec as unknown as string,
          match_count: candidateK,
          filter_document_id: documentId ?? null,
        });
        if (error) throw error;

        const candidates = (data ?? []) as RetrievedChunk[];
        let chunks: RetrievedChunk[];
        if (candidates.length <= finalK) {
          chunks = candidates;
        } else {
          try {
            const reranked = await rerank(question, candidates, finalK);
            // Preserve original RetrievedChunk fields; drop the rerank
            // score before sending to the client.
            chunks = reranked.map(({ rerankScore: _rs, ...rest }) => rest);
          } catch {
            chunks = candidates.slice(0, finalK);
          }
        }

        send({ type: "chunks", chunks });

        if (chunks.length === 0) {
          send({
            type: "token",
            text:
              "I couldn't find any indexed content to answer that. Upload a PDF first.",
          });
          send({ type: "done" });
          controller.close();
          return;
        }

        // Stream the answer, accumulating for persistence.
        let full = "";
        let usage = {
          input_tokens: 0,
          output_tokens: 0,
          cache_read_tokens: 0,
          cache_creation_tokens: 0,
        };
        const gen = streamAnswer(question, chunks);
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const next = await gen.next();
          if (next.done) {
            if (next.value) {
              full = next.value.full;
              usage = next.value.usage;
            }
            break;
          }
          full += next.value.text;
          send({ type: "token", text: next.value.text });
        }

        // Persist the conversation and its token usage.
        await admin.from("queries").insert({
          user_id: userId,
          document_id: documentId ?? null,
          question,
          answer: full,
          cited_chunk_ids: chunks.map((c) => c.id),
          input_tokens: usage.input_tokens,
          output_tokens: usage.output_tokens,
          cache_read_tokens: usage.cache_read_tokens,
          cache_creation_tokens: usage.cache_creation_tokens,
        });

        send({ type: "usage", usage });
        send({ type: "done" });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Ask failed.";
        send({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Hint to proxies (Vercel/Cloudflare) to not buffer.
      "X-Accel-Buffering": "no",
    },
  });
}
