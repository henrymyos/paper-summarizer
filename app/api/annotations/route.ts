import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserId } from "@/lib/user";

export const runtime = "nodejs";

export async function GET() {
  const userId = await getUserId();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("annotations")
    .select("id, document_id, chunk_id, page_number, text, note, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ annotations: data ?? [] });
}

const Body = z.object({
  document_id: z.string().uuid(),
  chunk_id: z.number().int().nullable().optional(),
  page_number: z.number().int().nullable().optional(),
  text: z.string().min(1).max(8000),
  note: z.string().max(2000).optional(),
});

export async function POST(req: Request) {
  const userId = await getUserId();
  const raw = await req.json().catch(() => null);
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("annotations")
    .insert({ ...parsed.data, user_id: userId })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ annotation: data });
}
