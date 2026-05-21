import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { RetrievedChunk } from "@/lib/answer";

const MODEL = "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `You are a careful research assistant. Answer the user's question using ONLY the numbered passages provided. Rules:

1. If the passages don't contain the answer, say "The provided passages don't answer this question." Do not draw on outside knowledge.
2. After each claim, cite the passage(s) it came from in square brackets like [1] or [2,3].
3. Format the response in clean Markdown — use **bold**, lists, and headers where they help. Quote sparingly; paraphrase in your own words.
4. Be concise — at most a few short paragraphs.`;

export async function* streamAnswer(
  question: string,
  chunks: RetrievedChunk[],
  client?: Anthropic,
): AsyncGenerator<string, string, void> {
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
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      full += event.delta.text;
      yield event.delta.text;
    }
  }

  return full;
}
