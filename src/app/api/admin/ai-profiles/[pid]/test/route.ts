import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { testKey, type AiProvider } from "@/lib/ai";
import { profileById } from "@/lib/aiProfiles";
import { decrypt } from "@/lib/crypto";
import { HttpError, api, requireOperator } from "@/lib/session";

type Ctx = { params: Promise<{ pid: string }> };

export const maxDuration = 60;

/** Prova il profilo con una richiesta minima e ricorda l'esito. */
export const POST = api(async (_req: Request, { params }: Ctx) => {
  const me = await requireOperator();
  const { pid } = await params;
  const p = await profileById(me.id, pid);
  if (!p) throw new HttpError(404, "Profilo non trovato");
  let key: string;
  try {
    key = decrypt(p.keyCiphertext);
  } catch {
    throw new HttpError(400, "Impossibile leggere la chiave salvata: inseriscila di nuovo");
  }
  const started = Date.now();
  let error: string | null = null;
  try {
    await testKey(p.provider as AiProvider, p.model, key);
  } catch (err) {
    error = err instanceof Error ? err.message : "Test fallito";
  }
  await getDb().update(schema.aiProfiles).set({ lastTestOk: !error, lastTestAt: new Date() }).where(eq(schema.aiProfiles.id, p.id));
  if (error) throw new HttpError(502, error);
  return NextResponse.json({ ok: true, ms: Date.now() - started });
});
