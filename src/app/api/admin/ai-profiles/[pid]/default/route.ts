import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { profileById } from "@/lib/aiProfiles";
import { HttpError, api, requireOperator } from "@/lib/session";

type Ctx = { params: Promise<{ pid: string }> };

/** Rende predefinito il profilo: lo useranno unioni, prima/dopo e convergenza. */
export const POST = api(async (_req: Request, { params }: Ctx) => {
  const me = await requireOperator();
  const { pid } = await params;
  const p = await profileById(me.id, pid);
  if (!p) throw new HttpError(404, "Profilo non trovato");
  await getDb().transaction(async (tx) => {
    await tx.update(schema.aiProfiles).set({ isDefault: false }).where(eq(schema.aiProfiles.userId, me.id));
    await tx.update(schema.aiProfiles).set({ isDefault: true }).where(eq(schema.aiProfiles.id, p.id));
  });
  return NextResponse.json({ ok: true });
});
