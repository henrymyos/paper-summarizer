/**
 * Eval harness.
 *
 *   npx tsx scripts/eval.ts [--user <uuid>] [--cases <path>]
 *
 * For each test case in evals/cases.json:
 *   1. Look up the target document by title in the user's library
 *   2. Embed the question (Voyage `voyage-3`, input_type=query)
 *   3. Retrieve top-20 chunks via the match_chunks pgvector RPC
 *   4. Rerank to top-5 with Voyage's `rerank-2`
 *   5. Generate a grounded answer with Claude Haiku 4.5
 *   6. Score:
 *        - keyword recall (% of expected_facts present in the answer)
 *        - faithfulness 1–5 (LLM-as-judge with the rubric)
 *        - latency (ms)
 *        - cost (USD)
 *
 * Aggregate metrics and a per-case table are printed to stdout; a full JSON
 * report (including raw answers + retrieved chunk previews) is written to
 * evals/reports/<ISO timestamp>.json.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

// ─── pricing (per million tokens, USD) ────────────────────────────────────
const PRICE = {
  inputPerM: 1.0,
  outputPerM: 5.0,
  cacheReadPerM: 0.1,
  voyageEmbedPerM: 0.06,
  voyageRerankPerM: 0.05,
};

type Case = {
  id: string;
  document_title: string;
  question: string;
  expected_facts: string[];
  rubric: string;
};

type Cases = { version: string; cases: Case[] };

type CaseResult = {
  caseId: string;
  documentTitle: string;
  question: string;
  status: "ok" | "skipped";
  reason?: string;
  retrieved: { id: number; page: number | null; preview: string; rerankScore: number }[];
  topRerank?: number;
  keywordHit?: number;
  keywordTotal?: number;
  faithfulness?: number;
  answer?: string;
  latencyMs?: number;
  costUsd?: number;
};

// ─── helpers ──────────────────────────────────────────────────────────────
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

// Free-tier Voyage is 3 RPM. Stay one under the cap for safety and apply
// the throttle across both embed and rerank calls. Tracks cumulative sleep
// time so case latency can report the actual API time, not the wall clock.
const voyageCallTimes: number[] = [];
let voyageSleptMs = 0;
async function awaitVoyageSlot() {
  const WINDOW_MS = 60_000;
  const MAX_PER_WINDOW = 2;
  while (true) {
    const now = Date.now();
    while (voyageCallTimes.length && voyageCallTimes[0] < now - WINDOW_MS) {
      voyageCallTimes.shift();
    }
    if (voyageCallTimes.length < MAX_PER_WINDOW) {
      voyageCallTimes.push(now);
      return;
    }
    const waitMs = voyageCallTimes[0] + WINDOW_MS - now + 500;
    process.stdout.write(`  (voyage rate-limit: sleeping ${Math.ceil(waitMs / 1000)}s)\r`);
    const sleepStart = Date.now();
    await new Promise((r) => setTimeout(r, waitMs));
    voyageSleptMs += Date.now() - sleepStart;
  }
}

async function voyageEmbed(text: string): Promise<{ vec: number[]; tokens: number }> {
  await awaitVoyageSlot();
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({
      input: [text],
      model: "voyage-3",
      input_type: "query",
    }),
  });
  if (!res.ok) throw new Error(`Voyage embed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as {
    data: { embedding: number[] }[];
    usage: { total_tokens: number };
  };
  return { vec: json.data[0].embedding, tokens: json.usage.total_tokens };
}

async function voyageRerank(
  query: string,
  docs: string[],
  topK: number,
): Promise<{ indices: number[]; scores: number[]; tokens: number }> {
  await awaitVoyageSlot();
  const res = await fetch("https://api.voyageai.com/v1/rerank", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({
      query,
      documents: docs,
      model: "rerank-2",
      top_k: Math.min(topK, docs.length),
    }),
  });
  if (!res.ok) throw new Error(`Voyage rerank: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as {
    data: { index: number; relevance_score: number }[];
    usage: { total_tokens: number };
  };
  return {
    indices: json.data.map((d) => d.index),
    scores: json.data.map((d) => d.relevance_score),
    tokens: json.usage.total_tokens,
  };
}

const ANSWER_SYSTEM = `You are a careful research assistant. Answer the user's question using ONLY the numbered passages provided. If they don't contain the answer, say so. After each claim, cite the passage(s) it came from in brackets like [1] or [2,3]. Keep the answer to a few short paragraphs.`;

async function generateAnswer(
  client: Anthropic,
  question: string,
  chunks: { text: string; page: number | null }[],
) {
  const passages = chunks
    .map((c, i) => `[${i + 1}] (page ${c.page ?? "?"})\n${c.text}`)
    .join("\n\n---\n\n");
  const t0 = Date.now();
  const res = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 600,
    system: ANSWER_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Question: ${question}\n\nPassages:\n\n${passages}`,
      },
    ],
  });
  const latencyMs = Date.now() - t0;
  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  return {
    text,
    latencyMs,
    inputTokens: res.usage.input_tokens,
    outputTokens: res.usage.output_tokens,
    cacheReadTokens: res.usage.cache_read_input_tokens ?? 0,
  };
}

const JUDGE_SYSTEM = `You are evaluating whether an answer faithfully addresses a question using the provided rubric.

Score on a 1–5 integer scale:
  5 — answer fully satisfies the rubric, no hallucinations
  4 — substantially correct, minor gap or fluff
  3 — partially correct
  2 — mostly wrong or evasive
  1 — completely wrong or hallucinated

Respond with ONLY a single integer 1–5. Nothing else.`;

async function judgeAnswer(
  client: Anthropic,
  question: string,
  rubric: string,
  answer: string,
): Promise<{ score: number; inputTokens: number; outputTokens: number }> {
  const res = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4,
    system: JUDGE_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Question: ${question}\n\nRubric: ${rubric}\n\nAnswer:\n${answer}`,
      },
    ],
  });
  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  const score = Number(text.match(/[1-5]/)?.[0] ?? 0);
  return {
    score: Number.isFinite(score) ? score : 0,
    inputTokens: res.usage.input_tokens,
    outputTokens: res.usage.output_tokens,
  };
}

function keywordRecall(answer: string, facts: string[]): { hit: number; total: number } {
  const norm = answer.toLowerCase();
  const hit = facts.filter((f) => norm.includes(f.toLowerCase())).length;
  return { hit, total: facts.length };
}

// ─── main ─────────────────────────────────────────────────────────────────
async function main() {
  const userId = arg("user") ?? process.env.DEFAULT_USER_ID;
  if (!userId) throw new Error("Pass --user <uuid> or set DEFAULT_USER_ID.");

  const casesPath =
    arg("cases") ?? path.resolve(process.cwd(), "evals/cases.json");
  const cases = JSON.parse(await readFile(casesPath, "utf8")) as Cases;

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Look up documents once.
  const { data: docs } = await admin
    .from("documents")
    .select("id, title")
    .eq("user_id", userId);
  const byTitle = new Map((docs ?? []).map((d) => [d.title, d.id as string]));

  const results: CaseResult[] = [];
  const startedAt = new Date();

  for (const c of cases.cases) {
    const docId = byTitle.get(c.document_title);
    if (!docId) {
      console.log(`✗ ${c.id} — skipped (no document titled "${c.document_title}")`);
      results.push({
        caseId: c.id,
        documentTitle: c.document_title,
        question: c.question,
        status: "skipped",
        reason: "document not in library",
        retrieved: [],
      });
      continue;
    }

    const t0 = Date.now();
    const sleptBefore = voyageSleptMs;

    const { vec, tokens: embedTokens } = await voyageEmbed(c.question);
    const { data: matches, error } = await admin.rpc("match_chunks", {
      query_embedding: vec as unknown as string,
      match_count: 20,
      filter_document_id: docId,
    });
    if (error) throw error;

    const candidates = (matches ?? []) as {
      id: number;
      page_number: number | null;
      text: string;
      similarity: number;
    }[];

    let final = candidates.slice(0, 5);
    let rerankScores = candidates.slice(0, 5).map(() => 0);
    let rerankTokens = 0;
    if (candidates.length > 5) {
      const r = await voyageRerank(
        c.question,
        candidates.map((c) => c.text),
        5,
      );
      final = r.indices.map((i) => candidates[i]);
      rerankScores = r.scores;
      rerankTokens = r.tokens;
    }

    const answer = await generateAnswer(
      claude,
      c.question,
      final.map((c) => ({ text: c.text, page: c.page_number })),
    );

    const judge = await judgeAnswer(claude, c.question, c.rubric, answer.text);
    const kw = keywordRecall(answer.text, c.expected_facts);

    const sleepInCase = voyageSleptMs - sleptBefore;
    const latencyMs = Date.now() - t0 - sleepInCase;
    const costUsd =
      ((embedTokens + rerankTokens) * PRICE.voyageEmbedPerM) / 1_000_000 +
      (answer.inputTokens * PRICE.inputPerM +
        answer.outputTokens * PRICE.outputPerM +
        answer.cacheReadTokens * PRICE.cacheReadPerM +
        judge.inputTokens * PRICE.inputPerM +
        judge.outputTokens * PRICE.outputPerM) /
        1_000_000;

    results.push({
      caseId: c.id,
      documentTitle: c.document_title,
      question: c.question,
      status: "ok",
      retrieved: final.map((c, i) => ({
        id: c.id,
        page: c.page_number,
        preview: c.text.slice(0, 120).replace(/\s+/g, " "),
        rerankScore: rerankScores[i] ?? 0,
      })),
      topRerank: rerankScores[0],
      keywordHit: kw.hit,
      keywordTotal: kw.total,
      faithfulness: judge.score,
      answer: answer.text,
      latencyMs,
      costUsd,
    });

    console.log(
      `✓ ${c.id.padEnd(28)}` +
        ` rerank=${(rerankScores[0] ?? 0).toFixed(2)}` +
        ` kw=${kw.hit}/${kw.total}` +
        ` faith=${judge.score}/5` +
        ` lat=${latencyMs}ms` +
        ` cost=$${costUsd.toFixed(4)}`,
    );
  }

  // ── aggregate metrics ──────────────────────────────────────────────────
  const ok = results.filter((r) => r.status === "ok");
  const mean = (xs: number[]) =>
    xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
  const median = (xs: number[]) => {
    if (xs.length === 0) return 0;
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };

  const aggregate = {
    cases_total: cases.cases.length,
    cases_run: ok.length,
    cases_skipped: results.length - ok.length,
    mean_keyword_recall: mean(
      ok.map((r) => (r.keywordTotal ? (r.keywordHit ?? 0) / r.keywordTotal : 0)),
    ),
    mean_faithfulness: mean(ok.map((r) => r.faithfulness ?? 0)),
    median_latency_ms: median(ok.map((r) => r.latencyMs ?? 0)),
    total_cost_usd: ok.reduce((a, r) => a + (r.costUsd ?? 0), 0),
  };

  console.log("\n── Aggregate ─────────────────────────────────────────");
  console.log(`  cases: ${aggregate.cases_run}/${aggregate.cases_total} run`);
  console.log(
    `  mean keyword recall:   ${(aggregate.mean_keyword_recall * 100).toFixed(0)}%`,
  );
  console.log(
    `  mean faithfulness:     ${aggregate.mean_faithfulness.toFixed(2)} / 5`,
  );
  console.log(`  median latency:        ${aggregate.median_latency_ms.toFixed(0)} ms`);
  console.log(`  total cost:            $${aggregate.total_cost_usd.toFixed(4)}`);

  await mkdir("evals/reports", { recursive: true });
  const reportPath = path.resolve(
    "evals/reports",
    `${startedAt.toISOString().replace(/[:.]/g, "-")}.json`,
  );
  await writeFile(
    reportPath,
    JSON.stringify({ startedAt, aggregate, results }, null, 2),
  );
  console.log(`\nReport: ${path.relative(process.cwd(), reportPath)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
