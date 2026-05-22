import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { RetrievedChunk } from "@/lib/answer";
import type { Usage } from "@/lib/pricing";

const MODEL = "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `You are a careful research assistant. Answer the user's question using ONLY the numbered passages provided. Rules:

1. If the passages don't contain the answer, say "The provided passages don't answer this question." Do not draw on outside knowledge.
2. After each claim, cite the passage(s) it came from in square brackets like [1] or [2,3].
3. Format the response in clean Markdown — use **bold**, lists, and headers where they help. Quote sparingly; paraphrase in your own words.
4. Be concise — at most a few short paragraphs.`;

export type StreamYield = { type: "text"; text: string };
export type StreamReturn = { full: string; usage: Usage };

export async function* streamAnswer(
  question: string,
  chunks: RetrievedChunk[],
  client?: Anthropic,
): AsyncGenerator<StreamYield, StreamReturn, void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  const anthropic = client ?? new Anthropic({ apiKey });

  const passages = chunks
    .map((c, i) => `[${i + 1}] (page ${c.page_number ?? "?"})\n${c.text}`)
    .join("\n\n---\n\n");

  const userMessage = `Question: ${question}\n\nPassages:\n\n${passages}`;

  let full = "";
  const stream = anthropic.messages.stream({
    model: MODEL,
    max_tokens: 1024,
    // cache_control on the system prompt — the system text doesn't change
    // across calls, so subsequent calls within ~5 minutes pay ~10% of the
    // base input price for those tokens.
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userMessage }],
  });

  const usage: Usage = {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_creation_tokens: 0,
  };

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      full += event.delta.text;
      yield { type: "text", text: event.delta.text };
    } else if (event.type === "message_start" && event.message?.usage) {
      const u = event.message.usage;
      usage.input_tokens = u.input_tokens ?? 0;
      usage.cache_read_tokens = u.cache_read_input_tokens ?? 0;
      usage.cache_creation_tokens = u.cache_creation_input_tokens ?? 0;
    } else if (event.type === "message_delta" && event.usage) {
      // Final usage update — Anthropic streams the output token count here.
      const u = event.usage;
      if (typeof u.output_tokens === "number") usage.output_tokens = u.output_tokens;
    }
  }

  return { full, usage };
}
