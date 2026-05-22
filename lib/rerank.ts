const RERANK_URL = "https://api.voyageai.com/v1/rerank";
const RERANK_MODEL = "rerank-2";

type RerankResponse = {
  data: { index: number; relevance_score: number }[];
};

/**
 * Cross-encoder rerank using Voyage. Given a query and a set of candidate
 * texts, returns the candidates sorted by relevance with their scores —
 * meaningfully better than raw cosine similarity for the top-k that
 * actually gets sent to the LLM.
 */
export async function rerank<T extends { text: string }>(
  query: string,
  candidates: T[],
  topK: number,
): Promise<(T & { rerankScore: number })[]> {
  if (candidates.length === 0) return [];
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) throw new Error("VOYAGE_API_KEY is not set");

  const res = await fetch(RERANK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query,
      documents: candidates.map((c) => c.text),
      model: RERANK_MODEL,
      top_k: Math.min(topK, candidates.length),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Voyage rerank failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as RerankResponse;
  return data.data.map((d) => ({
    ...candidates[d.index],
    rerankScore: d.relevance_score,
  }));
}
