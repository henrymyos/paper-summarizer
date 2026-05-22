export type DocumentStructure = {
  sections: { title: string; page?: number }[];
  figures: { label: string; caption: string; page?: number }[];
  tables: { label: string; caption: string; page?: number }[];
};

export type DocumentRow = {
  id: string;
  title: string;
  page_count: number | null;
  summary: string | null;
  suggested_questions: string[] | null;
  structure: DocumentStructure | null;
  references: string[] | null;
  created_at: string;
};

export type Annotation = {
  id: number;
  document_id: string;
  chunk_id: number | null;
  page_number: number | null;
  text: string;
  note: string | null;
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
