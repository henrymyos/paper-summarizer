/**
 * Re-runs the summarize/structure/references extraction on all of a
 * visitor's documents that don't yet have it. Uses already-stored chunks
 * — no new embeddings required, so it works under Voyage's free-tier
 * rate limits. Inlines the Claude call to avoid the `server-only`
 * import guard that the runtime lib uses.
 *
 *   npx tsx scripts/backfill-insights.ts [--user <uuid>]
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const MODEL = "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `You read a document and produce a structured analysis. Return STRICT JSON only — no prose, no code fences — matching:

{
  "summary": "2-3 sentence plain-English summary of what the document is about and why a reader would care.",
  "questions": ["...", "...", "...", "..."],
  "sections": [{"title": "Section title", "page": <number>}],
  "figures": [{"label": "Figure 1", "caption": "...", "page": <number>}],
  "tables":  [{"label": "Table 1",  "caption": "...", "page": <number>}],
  "references": ["Full citation string", "..."]
}

Rules:
- "questions" must contain exactly 4 SPECIFIC, useful starter questions grounded in this document.
- Use empty arrays / empty strings rather than null. All fields required.`;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function summarize(text: string) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const words = text.split(/\s+/).slice(0, 10000).join(" ");
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: `Document excerpt:\n\n${words}` }],
  });
  const out = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(out);
  } catch {
    return null;
  }
}

async function main() {
  const userId = arg("user") ?? process.env.DEFAULT_USER_ID;
  if (!userId) {
    console.error("Pass --user <uuid> or set DEFAULT_USER_ID");
    process.exit(1);
  }
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: docs, error } = await admin
    .from("documents")
    .select("id, title, structure, references, summary")
    .eq("user_id", userId);
  if (error) throw error;
  if (!docs || docs.length === 0) {
    console.log("No documents for that user.");
    return;
  }

  for (const doc of docs) {
    const { data: chunks, error: cErr } = await admin
      .from("chunks")
      .select("page_number, chunk_index, text")
      .eq("document_id", doc.id)
      .order("chunk_index");
    if (cErr) throw cErr;
    if (!chunks || chunks.length === 0) {
      console.log(`✗ ${doc.title} — no chunks, skipping.`);
      continue;
    }

    const text = chunks.map((c) => c.text).join(" ");
    console.log(`→ ${doc.title} — calling Claude on ${chunks.length} chunks…`);
    const insights = await summarize(text);
    if (!insights) {
      console.log("  parse failed, skipping");
      continue;
    }

    const sections = Array.isArray(insights.sections) ? insights.sections : [];
    const figures = Array.isArray(insights.figures) ? insights.figures : [];
    const tables = Array.isArray(insights.tables) ? insights.tables : [];
    const references = Array.isArray(insights.references)
      ? insights.references.filter((r: unknown) => typeof r === "string")
      : [];
    const hasStruct =
      sections.length > 0 || figures.length > 0 || tables.length > 0;

    await admin
      .from("documents")
      .update({
        summary:
          typeof insights.summary === "string" && insights.summary.trim()
            ? insights.summary
            : doc.summary,
        suggested_questions: Array.isArray(insights.questions)
          ? insights.questions.slice(0, 4)
          : null,
        structure: hasStruct ? { sections, figures, tables } : null,
        references: references.length > 0 ? references : null,
      })
      .eq("id", doc.id);

    console.log(
      `  sections=${sections.length} · figures=${figures.length} · tables=${tables.length} · references=${references.length}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
