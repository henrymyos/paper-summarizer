import { extractText, getDocumentProxy } from "unpdf";

export type PageText = { pageNumber: number; text: string };

/**
 * Parse a PDF into per-page text. Works with both Buffer (server-side script)
 * and Uint8Array (browser upload). Falls back gracefully if a page has no
 * extractable text (e.g. scanned image — OCR is out of scope for the MVP).
 */
export async function parsePdf(data: Uint8Array): Promise<{
  pages: PageText[];
  pageCount: number;
}> {
  const pdf = await getDocumentProxy(data);
  const { text: pageTexts } = await extractText(pdf, { mergePages: false });

  const pages: PageText[] = (pageTexts as string[]).map((text, i) => ({
    pageNumber: i + 1,
    text: (text ?? "").replace(/\s+/g, " ").trim(),
  }));

  return { pages, pageCount: pages.length };
}
