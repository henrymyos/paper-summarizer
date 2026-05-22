import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserId } from "@/lib/user";

export const runtime = "nodejs";

const Patch = z.object({
  note: z.string().max(2000).nullable().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const userId = getUserId();
  const raw = await req.json().catch(() => null);
  const parsed = Patch.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const admin = createAdminClient();
  const { error } = await admin
    .from("annotations")
    .update({ note: parsed.data.note ?? null })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const userId = getUserId();
  const admin = createAdminClient();
  const { error } = await admin
    .from("annotations")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
