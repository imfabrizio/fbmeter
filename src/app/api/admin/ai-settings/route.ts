import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { AI_PROVIDERS, type AiProvider } from "@/lib/ai";
import { encrypt } from "@/lib/crypto";
import { HttpError, api, readJson, requireOperator } from "@/lib/session";

/** La chiave non viene mai restituita: solo fornitore, modello e ultime 4 cifre. */
export const GET = api(async () => {
  const me = await requireOperator();
  const [s] = await getDb().select().from(schema.aiSettings).where(eq(schema.aiSettings.userId, me.id)).limit(1);
  return NextResponse.json(s ? { provider: s.provider, model: s.model, keyHint: s.keyHint, updatedAt: s.updatedAt } : null);
});

export const PUT = api(async (req: Request) => {
  const me = await requireOperator();
  const body = await readJson<{ provider?: string; model?: string; apiKey?: string }>(req);
  const provider = AI_PROVIDERS.find((p) => p.id === body.provider);
  if (!provider) throw new HttpError(400, "Fornitore non valido");
  const model = (body.model ?? "").trim() || provider.defaultModel;
  const apiKey = (body.apiKey ?? "").trim();
  const db = getDb();
  const [existing] = await db.select().from(schema.aiSettings).where(eq(schema.aiSettings.userId, me.id)).limit(1);

  if (!apiKey) {
    // cambio solo di modello/fornitore: serve una chiave già salvata per lo stesso fornitore
    if (!existing || existing.provider !== provider.id) throw new HttpError(400, "Inserisci la chiave API");
    await db.update(schema.aiSettings).set({ model, updatedAt: new Date() }).where(eq(schema.aiSettings.userId, me.id));
    return NextResponse.json({ ok: true });
  }
  if (apiKey.length < 20) throw new HttpError(400, "La chiave sembra troppo corta");

  const values = {
    userId: me.id,
    provider: provider.id as AiProvider,
    model,
    keyCiphertext: encrypt(apiKey),
    keyHint: `…${apiKey.slice(-4)}`,
    updatedAt: new Date(),
  };
  await db.insert(schema.aiSettings).values(values).onConflictDoUpdate({ target: schema.aiSettings.userId, set: values });
  return NextResponse.json({ ok: true });
});

export const DELETE = api(async () => {
  const me = await requireOperator();
  await getDb().delete(schema.aiSettings).where(eq(schema.aiSettings.userId, me.id));
  return NextResponse.json({ ok: true });
});
