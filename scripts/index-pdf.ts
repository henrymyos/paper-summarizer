/**
 * Index a PDF into Supabase.
 *
 * Usage:
 *   npm run index-pdf -- path/to/paper.pdf [--title "Paper Title"] [--user <uuid>]
 *
 * Requires env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * VOYAGE_API_KEY. Loads them from .env.local automatically.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv(); // also pick up plain `.env` if present
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createAdminClient } from "../lib/supabase/admin";
import { parsePdf } from "../lib/pdf";
import { chunkPages } from "../lib/chunking";
import { embed } from "../lib/embeddings";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: npm run index-pdf -- <path-to-pdf> [--title …] [--user <uuid>]");
    process.exit(1);
  }

  const userId = arg("user") ?? process.env.DEFAULT_USER_ID;
  if (!userId) {
    console.error("Missing --user <uuid> (or set DEFAULT_USER_ID in .env.local).");
    process.exit(1);
  }

  const title = arg("title") ?? path.basename(file, path.extname(file));
  console.log(`→ Parsing ${file}…`);

  const buf = await readFile(file);
  const { pages, pageCount } = await parsePdf(new Uint8Array(buf));
  console.log(`  parsed ${pageCount} pages`);

  const chunks = chunkPages(pages);
  console.log(`  produced ${chunks.length} chunks`);

  console.log("→ Embedding chunks…");
  // Voyage allows up to 128 inputs per call; batch to stay well under.
  const BATCH = 64;
  const vectors: number[][] = [];
  for (let i = 0; i < chunks.length; i += BATCH) {
    const slice = chunks.slice(i, i + BATCH).map((c) => c.text);
    const v = await embed(slice, "document");
    vectors.push(...v);
    console.log(`  embedded ${Math.min(i + BATCH, chunks.length)}/${chunks.length}`);
  }

  console.log("→ Writing to Supabase…");
  const admin = createAdminClient();

  const { data: doc, error: docErr } = await admin
    .from("documents")
    .insert({ user_id: userId, title, page_count: pageCount })
    .select()
    .single();
  if (docErr || !doc) throw docErr ?? new Error("insert documents failed");

  const rows = chunks.map((c, i) => ({
    document_id: doc.id,
    page_number: c.pageNumber ?? null,
    chunk_index: c.chunkIndex,
    text: c.text,
    embedding: vectors[i] as unknown as string, // pgvector accepts JSON arrays
  }));

  // Insert in batches to stay under request size limits.
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await admin.from("chunks").insert(rows.slice(i, i + 200));
    if (error) throw error;
  }

  console.log(`✓ Indexed "${title}" as document ${doc.id} (${chunks.length} chunks)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
