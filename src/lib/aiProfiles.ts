import { and, asc, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { AiProvider } from "./ai";
import { decrypt } from "./crypto";

export interface AiCreds {
  profileId: string;
  label: string;
  provider: AiProvider;
  model: string;
  key: string;
}

export type AiProfileRow = typeof schema.aiProfiles.$inferSelect;

/** Profili dell'operatore: prima il predefinito, poi gli altri nell'ordine di creazione. */
export async function listProfiles(userId: string): Promise<AiProfileRow[]> {
  return getDb()
    .select()
    .from(schema.aiProfiles)
    .where(eq(schema.aiProfiles.userId, userId))
    .orderBy(desc(schema.aiProfiles.isDefault), asc(schema.aiProfiles.createdAt));
}

export async function profileById(userId: string, id: string): Promise<AiProfileRow | null> {
  const [p] = await getDb()
    .select()
    .from(schema.aiProfiles)
    .where(and(eq(schema.aiProfiles.userId, userId), eq(schema.aiProfiles.id, id)))
    .limit(1);
  return p ?? null;
}

function toCreds(p: AiProfileRow): AiCreds | null {
  try {
    return { profileId: p.id, label: p.label, provider: p.provider as AiProvider, model: p.model, key: decrypt(p.keyCiphertext) };
  } catch {
    return null; // chiave cifrata con un'altra APP_ENCRYPTION_KEY
  }
}

/** Profili utilizzabili, in ordine di tentativo. Con `preferId` quel profilo va per primo. */
export async function aiCandidates(userId: string | null, preferId?: string | null): Promise<AiCreds[]> {
  if (!userId) return [];
  const rows = await listProfiles(userId);
  if (preferId) rows.sort((a, b) => Number(b.id === preferId) - Number(a.id === preferId));
  return rows.map(toCreds).filter((c): c is AiCreds => !!c);
}

export class NoAiError extends Error {
  constructor() {
    super("Configura prima un profilo AI in Impostazioni AI");
  }
}

/**
 * Esegue `fn` con il profilo predefinito; se fallisce (crediti finiti, chiave revocata,
 * modello non disponibile…) riprova con gli altri profili. Restituisce anche chi ha risposto.
 */
export async function withAi<T>(
  userId: string | null,
  fn: (ai: AiCreds) => Promise<T>,
  preferId?: string | null,
): Promise<{ result: T; used: AiCreds; failed: { label: string; error: string }[] }> {
  const list = await aiCandidates(userId, preferId);
  if (!list.length) throw new NoAiError();
  const failed: { label: string; error: string }[] = [];
  for (const ai of list) {
    try {
      return { result: await fn(ai), used: ai, failed };
    } catch (err) {
      const error = err instanceof Error ? err.message : "Errore AI";
      console.error(`AI "${ai.label}" non riuscita:`, error);
      failed.push({ label: ai.label, error });
    }
  }
  const e = new Error(failed.map((f) => `${f.label}: ${f.error}`).join(" · "));
  e.name = "AiAllFailed";
  throw e;
}
