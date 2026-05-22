import "server-only";
import Anthropic from "@anthropic-ai/sdk";

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
- "questions" must contain exactly 4 SPECIFIC, useful starter questions grounded in this document. Each under 90 chars. No generic "what is this about".
- "sections" should be the top-level section headings in document order. If the document has no obvious section structure (e.g. a one-page resume), return [].
- "figures" / "tables" should list anything explicitly labeled "Figure N" or "Table N" with its caption. If none, return [].
- "references" should be the document's bibliography / works-cited list as raw citation strings. If the document does not include references, return [].
- All fields are required. Use empty arrays / empty strings rather than null.`;

export type DocumentStructure = {
  sections: { title: string; page?: number }[];
  figures: { label: string; caption: string; page?: number }[];
  tables: { label: string; caption: string; page?: number }[];
};

export type DocumentInsights = {
  summary: string;
  suggestedQuestions: string[];
  structure: DocumentStructure;
  references: string[];
};

const EMPTY: DocumentInsights = {
  summary: "",
  suggestedQuestions: [],
  structure: { sections: [], figures: [], tables: [] },
  references: [],
};

/**
 * Run a single Claude call that produces summary + starter questions +
 * extracted structure + references. One round-trip keeps upload latency
 * low and cost predictable.
 */
export async function summarizeDocument(
  pages: { pageNumber: number; text: string }[],
): Promise<DocumentInsights> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  const client = new Anthropic({ apiKey });

  const joined = pages.map((p) => p.text).join("\n\n");
  const words = joined.split(/\s+/);
  const excerpt = words.slice(0, 10000).join(" ");

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
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

  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return EMPTY;
  }
  if (typeof parsed !== "object" || parsed === null) return EMPTY;
  const p = parsed as Record<string, unknown>;

  const summary = typeof p.summary === "string" ? p.summary.trim() : "";

  const questions = Array.isArray(p.questions)
    ? p.questions
        .filter((q): q is string => typeof q === "string")
        .map((q) => q.trim())
        .filter(Boolean)
        .slice(0, 4)
    : [];

  const coerceItems = (
    raw: unknown,
    needCaption: boolean,
  ): { label?: string; title?: string; caption: string; page?: number }[] => {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null)
      .map((x) => ({
        label: typeof x.label === "string" ? x.label : undefined,
        title: typeof x.title === "string" ? x.title : undefined,
        caption: typeof x.caption === "string" ? x.caption.trim() : "",
        page: typeof x.page === "number" ? x.page : undefined,
      }))
      .filter((x) => (needCaption ? Boolean(x.caption) : Boolean(x.title)));
  };

  const sections = coerceItems(p.sections, false).map((x) => ({
    title: x.title ?? "",
    page: x.page,
  }));
  const figures = coerceItems(p.figures, true).map((x) => ({
    label: x.label ?? "",
    caption: x.caption,
    page: x.page,
  }));
  const tables = coerceItems(p.tables, true).map((x) => ({
    label: x.label ?? "",
    caption: x.caption,
    page: x.page,
  }));

  const references = Array.isArray(p.references)
    ? p.references
        .filter((r): r is string => typeof r === "string")
        .map((r) => r.trim())
        .filter(Boolean)
    : [];

  return {
    summary,
    suggestedQuestions: questions,
    structure: { sections, figures, tables },
    references,
  };
}
