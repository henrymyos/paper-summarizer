const VOYAGE_MODEL = "voyage-3";
const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
export const EMBEDDING_DIM = 1024;

type VoyageResponse = {
  data: { embedding: number[]; index: number }[];
};

/**
 * Embed an array of strings via the Voyage API. `inputType` lets Voyage
 * tailor the embedding for either documents (indexing) or queries
 * (retrieval), which improves retrieval quality at no extra cost.
 *
 * Called fetch directly rather than the `voyageai` SDK because that
 * package's published ESM build has a broken internal import that breaks
 * Next.js bundling.
 */
export async function embed(
  texts: string[],
  inputType: "document" | "query" = "document",
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) throw new Error("VOYAGE_API_KEY is not set");

  const res = await fetch(VOYAGE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      input: texts,
      model: VOYAGE_MODEL,
      input_type: inputType,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Voyage embed failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as VoyageResponse;
  // The API returns results indexed by input position; sort to be safe.
  return data.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}
