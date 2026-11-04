import { NextResponse } from "next/server";
import { suggestGroups } from "@/lib/ai";
import { NoAiError, withAi } from "@/lib/aiProfiles";
import { blocksWithQuestions, eventById, questionResults } from "@/lib/events";
import { HttpError, api, requireOperator } from "@/lib/session";

type Ctx = { params: Promise<{ id: string; blockId: string }> };

export const maxDuration = 60;

/**
 * Chiede all'AI dell'operatore collegato di proporre raggruppamenti.
 * Non salva nulla: l'operatore sceglie cosa applicare.
 */
export const POST = api(async (req: Request, { params }: Ctx) => {
  const me = await requireOperator();
  const { id, blockId } = await params;
  const ev = await eventById(id);
  const block = (await blocksWithQuestions(ev.id)).find((b) => b.id === blockId);
  if (!block) throw new HttpError(404, "Blocco non trovato");

  const body = (await req.json().catch(() => ({}))) as { profileId?: string };

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

  try {
    const { result: groups, used, failed } = await withAi(
      me.id,
      (ai) => suggestGroups(ai, block.title, words),
      body.profileId,
    );
    const byLabel = new Map(words.map((w) => [w.label, w]));
    return NextResponse.json({
      provider: used.provider,
      model: used.model,
      profile: used.label,
      fallbackFrom: failed.map((f) => f.label),
      groups: groups.map((g) => ({
        label: g.label,
        members: g.members.map((m) => ({ label: m, key: byLabel.get(m)!.key, count: byLabel.get(m)!.count })),
      })),
    });
  } catch (err) {
    if (err instanceof NoAiError) throw new HttpError(400, err.message);
    throw new HttpError(502, err instanceof Error ? err.message : "Errore AI");
  }
});
