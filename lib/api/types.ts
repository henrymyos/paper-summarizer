export type DocumentRow = {
  id: string;
  title: string;
  page_count: number | null;
  created_at: string;
};

export type ApiChunk = {
  id: number;
  document_id: string;
  page_number: number | null;
  chunk_index: number;
  text: string;
  // null when the chunk came from persisted history (we don't store the
  // per-query similarity score). The UI hides the metric in that case.
  similarity: number | null;
};

export type AskResponse = {
  answer: string;
  chunks: ApiChunk[];
};

export type ChatMessage =
  | { role: "user"; id: string; content: string }
  | {
      role: "assistant";
      id: string;
      answer: string;
      chunks: ApiChunk[];
    };
