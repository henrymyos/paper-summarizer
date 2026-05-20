import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-haiku-4-5-20251001";

export type RetrievedChunk = {
  id: number;
  page_number: number | null;
  text: string;
  similarity: number;
};

const SYSTEM_PROMPT = `You are a careful research assistant. Answer the user's question using ONLY the numbered passages provided. Rules:

1. If the passages don't contain the answer, say "The provided passages don't answer this question." Do not draw on outside knowledge.
2. After each claim, cite the passage(s) it came from in square brackets like [1] or [2,3].
3. Quote sparingly; paraphrase in your own words.
4. Be concise — at most a few short paragraphs.`;

export async function generateAnswer(
  question: string,
  chunks: RetrievedChunk[],
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  const client = new Anthropic({ apiKey });

  const passages = chunks
    .map(
      (c, i) =>
        `[${i + 1}] (page ${c.page_number ?? "?"})\n${c.text}`,
    )
    .join("\n\n---\n\n");

  const userMessage = `Question: ${question}\n\nPassages:\n\n${passages}`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  return text;
}
