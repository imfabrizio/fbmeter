import { and, asc, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { AI_PROVIDERS } from "@/lib/ai";
import { profileById } from "@/lib/aiProfiles";
import { encrypt } from "@/lib/crypto";
import { HttpError, api, readJson, requireOperator } from "@/lib/session";

type Ctx = { params: Promise<{ pid: string }> };

/** Modifica nome, modello o chiave. Cambiare fornitore richiede una chiave nuova. */
export const PATCH = api(async (req: Request, { params }: Ctx) => {
  const me = await requireOperator();
  const { pid } = await params;
  const p = await profileById(me.id, pid);
  if (!p) throw new HttpError(404, "Profilo non trovato");
  const body = await readJson<{ label?: string; provider?: string; model?: string; apiKey?: string }>(req);
  const provider = AI_PROVIDERS.find((x) => x.id === (body.provider ?? p.provider));
  if (!provider) throw new HttpError(400, "Fornitore non valido");
  const apiKey = (body.apiKey ?? "").trim();
  if (provider.id !== p.provider && !apiKey) throw new HttpError(400, "Cambiando fornitore serve anche la sua chiave API");
  if (apiKey && apiKey.length < 20) throw new HttpError(400, "La chiave sembra troppo corta");
  const set: Partial<typeof schema.aiProfiles.$inferInsert> = { updatedAt: new Date(), provider: provider.id };
  if (body.label !== undefined) set.label = body.label.trim().slice(0, 60) || p.label;
  if (body.model !== undefined) set.model = body.model.trim() || provider.defaultModel;
  if (apiKey) {
    set.keyCiphertext = encrypt(apiKey);
    set.keyHint = `…${apiKey.slice(-4)}`;
  }
  if (apiKey || set.model !== p.model || set.provider !== p.provider) {
    set.lastTestOk = null;
    set.lastTestAt = null;
  }
  await getDb().update(schema.aiProfiles).set(set).where(eq(schema.aiProfiles.id, p.id));
  return NextResponse.json({ ok: true });
});

export const DELETE = api(async (_req: Request, { params }: Ctx) => {
  const me = await requireOperator();
  const { pid } = await params;
  const p = await profileById(me.id, pid);
  if (!p) throw new HttpError(404, "Profilo non trovato");
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.delete(schema.aiProfiles).where(eq(schema.aiProfiles.id, p.id));
    if (p.isDefault) {
      // il più vecchio tra i rimasti diventa predefinito
      const [next] = await tx
        .select({ id: schema.aiProfiles.id })
        .from(schema.aiProfiles)
        .where(and(eq(schema.aiProfiles.userId, me.id), ne(schema.aiProfiles.id, p.id)))
        .orderBy(asc(schema.aiProfiles.createdAt))
        .limit(1);
      if (next) await tx.update(schema.aiProfiles).set({ isDefault: true }).where(eq(schema.aiProfiles.id, next.id));
    }
  });
  return NextResponse.json({ ok: true });
});
