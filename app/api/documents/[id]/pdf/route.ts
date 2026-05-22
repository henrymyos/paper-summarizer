import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserId } from "@/lib/user";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const userId = await getUserId();
  const admin = createAdminClient();

  const { data: doc, error } = await admin
    .from("documents")
    .select("storage_path")
    .eq("id", id)
    .eq("user_id", userId)
    .single();

  if (error || !doc?.storage_path) {
    return NextResponse.json({ error: "PDF not available" }, { status: 404 });
  }

  const { data: file, error: dlErr } = await admin.storage
    .from("pdfs")
    .download(doc.storage_path);

  if (dlErr || !file) {
    return NextResponse.json({ error: "PDF download failed" }, { status: 500 });
  }

  const buf = await file.arrayBuffer();
  return new Response(buf, {
    headers: {
      "Content-Type": "application/pdf",
      "Cache-Control": "private, max-age=300",
      "Content-Disposition": "inline",
    },
  });
}
