-- =============================================
-- Paper Summarizer — Supabase Schema
-- Run this in your Supabase SQL Editor.
-- =============================================

-- pgvector for embedding similarity search
create extension if not exists vector;

-- Each uploaded PDF.
create table if not exists documents (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid references auth.users(id) on delete cascade not null,
  title                text not null,
  page_count           int,
  storage_path         text,
  summary              text,
  suggested_questions  text[],
  created_at           timestamptz default now()
);

-- Text chunks extracted from each document.
-- Voyage `voyage-3` returns 1024-dim vectors; voyage-3-large is 1024 too.
-- text-embedding-3-small is 1536. Adjust to match the model you pick.
create table if not exists chunks (
  id           bigserial primary key,
  document_id  uuid references documents(id) on delete cascade not null,
  page_number  int,
  chunk_index  int not null,
  text         text not null,
  embedding    vector(1024),
  created_at   timestamptz default now()
);

create index if not exists chunks_document_idx on chunks(document_id);

-- Approximate-nearest-neighbor index for fast similarity search.
-- Use ivfflat for now; rebuild as the dataset grows.
create index if not exists chunks_embedding_idx
  on chunks using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- Conversation history for a document.
create table if not exists queries (
  id               bigserial primary key,
  user_id          uuid references auth.users(id) on delete cascade not null,
  document_id      uuid references documents(id) on delete cascade,
  question         text not null,
  answer           text,
  cited_chunk_ids  bigint[],
  created_at       timestamptz default now()
);

-- =============================================
-- Row-Level Security
-- =============================================
alter table documents enable row level security;
alter table chunks    enable row level security;
alter table queries   enable row level security;

create policy "documents are visible to owner"
  on documents for select using (auth.uid() = user_id);

create policy "documents are insertable by owner"
  on documents for insert with check (auth.uid() = user_id);

create policy "documents are deletable by owner"
  on documents for delete using (auth.uid() = user_id);

create policy "chunks follow their parent document"
  on chunks for all
  using (
    exists (
      select 1 from documents d
      where d.id = chunks.document_id and d.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from documents d
      where d.id = chunks.document_id and d.user_id = auth.uid()
    )
  );

create policy "queries are visible to owner"
  on queries for select using (auth.uid() = user_id);

create policy "queries are insertable by owner"
  on queries for insert with check (auth.uid() = user_id);

-- =============================================
-- Similarity search RPC
-- Returns the top-k chunks for a given embedding, restricted to documents
-- the calling user owns (RLS on documents enforces this implicitly via the
-- security-invoker default).
-- =============================================
create or replace function match_chunks(
  query_embedding vector(1024),
  match_count int default 5,
  filter_document_id uuid default null
)
returns table (
  id bigint,
  document_id uuid,
  page_number int,
  chunk_index int,
  text text,
  similarity float
)
language sql stable security invoker
as $$
  select
    c.id,
    c.document_id,
    c.page_number,
    c.chunk_index,
    c.text,
    1 - (c.embedding <=> query_embedding) as similarity
  from chunks c
  where
    (filter_document_id is null or c.document_id = filter_document_id)
    and c.embedding is not null
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
