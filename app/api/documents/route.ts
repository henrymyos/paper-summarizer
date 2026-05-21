import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { indexPdf } from "@/lib/indexing";
import { getUserId } from "@/lib/user";

export const runtime = "nodejs";
// PDFs can take a bit to embed; give the route generous headroom.
export const maxDuration = 60;

export async function GET() {
  const userId = getUserId();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("documents")
    .select("id, title, page_count, summary, suggested_questions, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ documents: data ?? [] });
}

export async function POST(req: Request) {
  const userId = getUserId();
  const form = await req.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "Only PDF files are supported." }, { status: 400 });
  }

  const buf = new Uint8Array(await file.arrayBuffer());
  const title =
    (form.get("title") as string | null)?.trim() ||
    file.name.replace(/\.pdf$/i, "");

  try {
    const result = await indexPdf(buf, { title, userId });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Indexing failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
