import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserId } from "@/lib/user";
import { costFor } from "@/lib/pricing";

export const runtime = "nodejs";

export async function GET() {
  const userId = await getUserId();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("queries")
    .select(
      "input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens",
    )
    .eq("user_id", userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const totals = (data ?? []).reduce(
    (acc, row) => ({
      input_tokens: acc.input_tokens + (row.input_tokens ?? 0),
      output_tokens: acc.output_tokens + (row.output_tokens ?? 0),
      cache_read_tokens: acc.cache_read_tokens + (row.cache_read_tokens ?? 0),
      cache_creation_tokens:
        acc.cache_creation_tokens + (row.cache_creation_tokens ?? 0),
    }),
    {
      input_tokens: 0,
      output_tokens: 0,
      cache_read_tokens: 0,
      cache_creation_tokens: 0,
    },
  );

  return NextResponse.json({
    queries: (data ?? []).length,
    tokens: totals,
    estimatedCostUsd: costFor(totals),
  });
}
