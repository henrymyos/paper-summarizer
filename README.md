# 📄 Paper Summarizer

Retrieval-Augmented Generation (RAG) Q&A over PDFs. Upload a paper, ask questions in natural language, and get answers with citations back to the source paragraphs.

## How it works

1. **Parse** — extract per-page text from the PDF.
2. **Chunk** — split each page into overlapping ~350-word chunks.
3. **Embed** — turn each chunk into a 1024-dim vector via Voyage AI.
4. **Store** — write chunks + embeddings to Supabase Postgres with the `pgvector` extension.
5. **Retrieve** — embed the user's question and find the top-k most similar chunks with cosine similarity.
6. **Answer** — feed the retrieved chunks to Claude with instructions to answer using only those passages, citing each claim.

## Stack

- **Next.js + TypeScript + Tailwind** — app and UI
- **Supabase** — Postgres + `pgvector` + Auth + Row-Level Security
- **Voyage AI** — embeddings (`voyage-3`)
- **Anthropic Claude** — grounded answer generation (`claude-sonnet-4-6`)
- **unpdf** — PDF text extraction

## Setup

1. **Create a Supabase project** at supabase.com.
2. **Run the schema:** open the Supabase SQL editor and paste `supabase/schema.sql`. This creates the `documents`, `chunks`, and `queries` tables, enables `pgvector`, sets up RLS, and defines the `match_chunks` RPC.
3. **Copy env vars:**
   ```bash
   cp .env.example .env.local
   # Fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
   # SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY, VOYAGE_API_KEY
   ```
4. **Create a user.** In the Supabase dashboard → Authentication → Users → "Add user". Copy that user's UUID into `DEFAULT_USER_ID` so the CLI scripts can attribute documents to you.

## Try the pipeline end-to-end (no UI needed yet)

```bash
# Index a PDF
npm run index-pdf -- ./papers/attention-is-all-you-need.pdf --title "Attention Is All You Need"

# Ask a question across everything you've indexed
npm run ask -- "What is the difference between encoder and decoder self-attention?"

# Or scope to one document
npm run ask -- "What dataset did they train on?" --doc <document-uuid>
```

You'll see the top-k retrieved passages printed first, then Claude's answer with `[1]`, `[2]` citations.

## Run the web app

```bash
npm run dev
# open http://localhost:3000
```

The web UI currently shows the project intro — the upload form, document list, and chat box are the next build step.

## Layout

```
.
├── app/                    # Next.js App Router pages
├── lib/
│   ├── chunking.ts         # text → overlapping chunks
│   ├── pdf.ts              # PDF → per-page text
│   ├── embeddings.ts       # Voyage AI wrapper
│   ├── answer.ts           # Claude grounded-answer prompt
│   └── supabase/           # browser, server, and admin clients
├── scripts/
│   ├── index-pdf.ts        # CLI: parse + chunk + embed + store
│   └── ask.ts              # CLI: retrieve + answer
└── supabase/
    └── schema.sql          # tables, pgvector index, RLS, match_chunks RPC
```

## Roadmap

- [x] PDF parse → chunk → embed → store
- [x] Vector search + grounded Q&A (CLI)
- [ ] Upload form + document list (web)
- [ ] Chat UI with citation pills linking to source pages
- [ ] Auth flow (Supabase email/OAuth)
- [ ] Cross-document search (whole-library Q&A)
- [ ] Section-by-section structured summaries
