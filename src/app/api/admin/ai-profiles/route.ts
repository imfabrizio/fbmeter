import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { AI_PROVIDERS, normalizeAzureEndpoint } from "@/lib/ai";
import { listProfiles } from "@/lib/aiProfiles";
import { encrypt } from "@/lib/crypto";
import { HttpError, api, readJson, requireOperator } from "@/lib/session";

const MAX_PROFILES = 10;

/** Le chiavi non vengono mai restituite: solo nome, fornitore, modello e ultime 4 cifre. */
export function publicProfile(p: typeof schema.aiProfiles.$inferSelect) {
  return {
    id: p.id,
    label: p.label,
    provider: p.provider,
    model: p.model,
    endpoint: p.endpoint,
    keyHint: p.keyHint,
    isDefault: p.isDefault,
    lastTestOk: p.lastTestOk,
    lastTestAt: p.lastTestAt,
    updatedAt: p.updatedAt,
  };
}

export const GET = api(async () => {
  const me = await requireOperator();
  return NextResponse.json((await listProfiles(me.id)).map(publicProfile));
});

export const POST = api(async (req: Request) => {
  const me = await requireOperator();
  const body = await readJson<{ label?: string; provider?: string; model?: string; endpoint?: string; apiKey?: string; isDefault?: boolean }>(req);
  const provider = AI_PROVIDERS.find((p) => p.id === body.provider);
  if (!provider) throw new HttpError(400, "Fornitore non valido");
  const apiKey = (body.apiKey ?? "").trim();
  if (apiKey.length < 20) throw new HttpError(400, "Inserisci una chiave API valida");
  const existing = await listProfiles(me.id);
  if (existing.length >= MAX_PROFILES) throw new HttpError(400, `Massimo ${MAX_PROFILES} profili`);
  const model = (body.model ?? "").trim() || provider.defaultModel;
  if (!model) throw new HttpError(400, provider.needsEndpoint ? "Inserisci il nome del deployment" : "Inserisci il modello");
  let endpoint: string | null = null;
  if (provider.needsEndpoint) {
    if (!body.endpoint?.trim()) throw new HttpError(400, "Inserisci l'endpoint della risorsa");
    try {
      endpoint = normalizeAzureEndpoint(body.endpoint);
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
  }
  const label = (body.label ?? "").trim().slice(0, 60) || `${provider.short} · ${model}`;
  const makeDefault = existing.length === 0 || !!body.isDefault;

  const db = getDb();
  const [created] = await db.transaction(async (tx) => {
    if (makeDefault) await tx.update(schema.aiProfiles).set({ isDefault: false }).where(eq(schema.aiProfiles.userId, me.id));
    return tx
      .insert(schema.aiProfiles)
      .values({ userId: me.id, label, provider: provider.id, model, endpoint, keyCiphertext: encrypt(apiKey), keyHint: `…${apiKey.slice(-4)}`, isDefault: makeDefault })
      .returning();
  });
  return NextResponse.json(publicProfile(created));
});
