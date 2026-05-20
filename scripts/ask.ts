/**
 * Ask a question against your indexed documents. Prints the retrieved
 * chunks and the model's grounded answer.
 *
 * Usage:
 *   npm run ask -- "What did the paper conclude about X?" [--doc <uuid>] [-k 5]
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();
import { createAdminClient } from "../lib/supabase/admin";
import { embed } from "../lib/embeddings";
import { generateAnswer, type RetrievedChunk } from "../lib/answer";

function arg(name: string, short?: string): string | undefined {
  for (const flag of [`--${name}`, short && `-${short}`].filter(Boolean) as string[]) {
    const i = process.argv.indexOf(flag);
    if (i >= 0) return process.argv[i + 1];
  }
  return undefined;
}

async function main() {
  const question = process.argv[2];
  if (!question || question.startsWith("-")) {
    console.error('Usage: npm run ask -- "your question" [--doc <uuid>] [-k 5]');
    process.exit(1);
  }

  const k = Number(arg("k", "k") ?? "5");
  const documentId = arg("doc");

  console.log(`→ Embedding question…`);
  const [qVec] = await embed([question], "query");

  console.log(`→ Searching top-${k} chunks${documentId ? ` in document ${documentId}` : " across all documents"}…`);
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("match_chunks", {
    query_embedding: qVec as unknown as string,
    match_count: k,
    filter_document_id: documentId ?? null,
  });
  if (error) throw error;

  const chunks = (data ?? []) as RetrievedChunk[];
  if (chunks.length === 0) {
    console.log("No chunks found. Have you indexed any PDFs?");
    return;
  }

  console.log("\n--- Retrieved passages ---");
  chunks.forEach((c, i) => {
    console.log(`[${i + 1}] page ${c.page_number ?? "?"} · similarity ${c.similarity.toFixed(3)}`);
    console.log(`    ${c.text.slice(0, 200).replace(/\s+/g, " ")}${c.text.length > 200 ? "…" : ""}`);
  });

  console.log("\n→ Asking Claude…\n");
  const answer = await generateAnswer(question, chunks);
  console.log("--- Answer ---");
  console.log(answer);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
