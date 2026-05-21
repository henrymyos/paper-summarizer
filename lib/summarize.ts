import "server-only";
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `You read a document and produce two things:

1. A 2-3 sentence plain-English summary that captures what the document is about and why a reader would care. No bullets, no markdown headers — just clean prose.
2. Exactly 4 specific, useful starter questions a reader could ask about THIS document. Concrete and grounded in the content, not generic ("what is this about" is forbidden). Each under 90 characters.

Respond with valid JSON only, no prose around it, matching this shape:
{"summary": "...", "questions": ["...","...","...","..."]}`;

export type DocumentInsights = {
  summary: string;
  suggestedQuestions: string[];
};

/**
 * Generate a short summary + 4 starter questions for a document. Uses the
 * first ~6k words of the text — enough to capture intent without burning
 * tokens on huge documents.
 */
export async function summarizeDocument(
  pages: { pageNumber: number; text: string }[],
): Promise<DocumentInsights> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  const client = new Anthropic({ apiKey });

  const joined = pages.map((p) => p.text).join("\n\n");
  const words = joined.split(/\s+/);
  const excerpt = words.slice(0, 6000).join(" ");

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 600,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Document excerpt:\n\n${excerpt}`,
      },
    ],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  // Strip code fences if Claude wrapped the JSON.
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let parsed: { summary?: unknown; questions?: unknown };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return { summary: "", suggestedQuestions: [] };
  }

  const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
  const questions = Array.isArray(parsed.questions)
    ? parsed.questions
        .filter((q): q is string => typeof q === "string")
        .map((q) => q.trim())
        .filter(Boolean)
        .slice(0, 4)
    : [];

  return { summary, suggestedQuestions: questions };
}
