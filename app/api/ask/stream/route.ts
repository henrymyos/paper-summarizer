import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { embed } from "@/lib/embeddings";
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
  const userId = getUserId();
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
        // Embed the question + retrieve top-k chunks.
        const [qVec] = await embed([question], "query");
        const admin = createAdminClient();
        const { data, error } = await admin.rpc("match_chunks", {
          query_embedding: qVec as unknown as string,
          match_count: k ?? 5,
          filter_document_id: documentId ?? null,
        });
        if (error) throw error;

        const chunks = (data ?? []) as RetrievedChunk[];
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
        const gen = streamAnswer(question, chunks);
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const next = await gen.next();
          if (next.done) {
            full = (next.value ?? full) as string;
            break;
          }
          full += next.value;
          send({ type: "token", text: next.value });
        }

        // Persist the conversation after streaming completes.
        await admin.from("queries").insert({
          user_id: userId,
          document_id: documentId ?? null,
          question,
          answer: full,
          cited_chunk_ids: chunks.map((c) => c.id),
        });

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
