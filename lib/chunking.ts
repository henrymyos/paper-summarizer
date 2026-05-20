/**
 * Word-based chunker with overlap. Token-aware chunking would be more precise
 * (use `tiktoken` or `@anthropic-ai/tokenizer`), but words are a reasonable
 * proxy for an MVP and keep the dependency surface small.
 */
export type Chunk = {
  text: string;
  chunkIndex: number;
  pageNumber?: number;
};

export function chunkText(
  text: string,
  { wordsPerChunk = 350, overlapWords = 50 } = {},
): Chunk[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const chunks: Chunk[] = [];
  const stride = Math.max(1, wordsPerChunk - overlapWords);

  for (let start = 0, idx = 0; start < words.length; start += stride, idx++) {
    const slice = words.slice(start, start + wordsPerChunk);
    if (slice.length === 0) break;
    chunks.push({ text: slice.join(" "), chunkIndex: idx });
    if (start + wordsPerChunk >= words.length) break;
  }

  return chunks;
}

/**
 * Chunk text page-by-page so we can keep page numbers attached. Pages that
 * are themselves longer than `wordsPerChunk` get sub-chunked with overlap.
 */
export function chunkPages(
  pages: { pageNumber: number; text: string }[],
  opts?: { wordsPerChunk?: number; overlapWords?: number },
): Chunk[] {
  const out: Chunk[] = [];
  let globalIndex = 0;

  for (const { pageNumber, text } of pages) {
    const local = chunkText(text, opts);
    for (const c of local) {
      out.push({ text: c.text, chunkIndex: globalIndex++, pageNumber });
    }
  }

  return out;
}
