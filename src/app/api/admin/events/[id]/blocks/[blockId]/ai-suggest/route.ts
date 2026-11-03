import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { suggestGroups, type AiProvider } from "@/lib/ai";
import { decrypt } from "@/lib/crypto";
import { blocksWithQuestions, eventById, questionResults } from "@/lib/events";
import { HttpError, api, requireOperator } from "@/lib/session";

type Ctx = { params: Promise<{ id: string; blockId: string }> };

export const maxDuration = 60;

/**
 * Chiede all'AI dell'operatore collegato di proporre raggruppamenti.
 * Non salva nulla: l'operatore sceglie cosa applicare.
 */
export const POST = api(async (_req: Request, { params }: Ctx) => {
  const me = await requireOperator();
  const { id, blockId } = await params;
  const ev = await eventById(id);
  const block = (await blocksWithQuestions(ev.id)).find((b) => b.id === blockId);
  if (!block) throw new HttpError(404, "Blocco non trovato");

  const [settings] = await getDb().select().from(schema.aiSettings).where(eq(schema.aiSettings.userId, me.id)).limit(1);
  if (!settings) throw new HttpError(400, "Configura prima la tua chiave AI in Impostazioni AI");

  const stats = await questionResults(block.questions.filter((q) => q.type === "words"));
  const merged = new Map<string, { key: string; label: string; count: number }>();
  for (const s of stats.values()) {
    if (s.type !== "words") continue;
    for (const w of s.words) {
      const m = merged.get(w.key) ?? { key: w.key, label: w.label, count: 0 };
      m.count += w.count;
      merged.set(w.key, m);
    }
  }
  const words = [...merged.values()].sort((a, b) => b.count - a.count);
  if (words.length < 2) return NextResponse.json({ groups: [] });

  let apiKey: string;
  try {
    apiKey = decrypt(settings.keyCiphertext);
  } catch {
    throw new HttpError(400, "Impossibile leggere la chiave salvata: inseriscila di nuovo");
  }

  try {
    const groups = await suggestGroups(settings.provider as AiProvider, settings.model, apiKey, block.title, words);
    const byLabel = new Map(words.map((w) => [w.label, w]));
    return NextResponse.json({
      provider: settings.provider,
      model: settings.model,
      groups: groups.map((g) => ({
        label: g.label,
        members: g.members.map((m) => ({ label: m, key: byLabel.get(m)!.key, count: byLabel.get(m)!.count })),
      })),
    });
  } catch (err) {
    throw new HttpError(502, err instanceof Error ? err.message : "Errore AI");
  }
});
