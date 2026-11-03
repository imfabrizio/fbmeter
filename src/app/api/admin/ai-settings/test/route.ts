import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { testKey, type AiProvider } from "@/lib/ai";
import { decrypt } from "@/lib/crypto";
import { HttpError, api, requireOperator } from "@/lib/session";

export const maxDuration = 60;

/** Verifica che la chiave salvata funzioni. */
export const POST = api(async () => {
  const me = await requireOperator();
  const [s] = await getDb().select().from(schema.aiSettings).where(eq(schema.aiSettings.userId, me.id)).limit(1);
  if (!s) throw new HttpError(400, "Nessuna chiave salvata");
  try {
    await testKey(s.provider as AiProvider, s.model, decrypt(s.keyCiphertext));
  } catch (err) {
    throw new HttpError(502, err instanceof Error ? err.message : "Test fallito");
  }
  return NextResponse.json({ ok: true });
});
