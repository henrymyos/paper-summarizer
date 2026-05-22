import { NextResponse } from "next/server";
import { z } from "zod";
import { ask } from "@/lib/retrieval";
import { getUserId } from "@/lib/user";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  question: z.string().min(1).max(2000),
  documentId: z.string().uuid().nullable().optional(),
  k: z.number().int().min(1).max(20).optional(),
});

export async function POST(req: Request) {
  const userId = await getUserId();
  const raw = await req.json().catch(() => null);
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const result = await ask(parsed.data.question, {
      documentId: parsed.data.documentId ?? null,
      k: parsed.data.k,
      userId,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ask failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
