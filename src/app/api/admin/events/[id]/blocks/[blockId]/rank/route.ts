import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { blocksWithQuestions, eventById, questionResults } from "@/lib/events";
import { prepareReveal } from "@/lib/reveal";
import { HttpError, api, readJson, requireOperator } from "@/lib/session";
import { ensureRank } from "@/lib/wordRank";
import { wordsSignature } from "@/lib/words";

type Ctx = { params: Promise<{ id: string; blockId: string }> };

export const maxDuration = 60;

/**
 * Scelta delle parole più sensate di una domanda.
 * action: "redo" (rifà la scelta con l'AI) · "clear" (solo conteggi e parentele) · "restore" (rimette una voce scartata).
 * Se il prima/dopo del blocco era già pronto, lo ricalcola con la nuova scelta.
 */
export const POST = api(async (req: Request, { params }: Ctx) => {
  const me = await requireOperator();
  const { id, blockId } = await params;
  const ev = await eventById(id);
  const body = await readJson<{ questionId?: string; action?: string; key?: string }>(req);
  const block = (await blocksWithQuestions(ev.id)).find((b) => b.id === blockId);
  if (!block) throw new HttpError(404, "Blocco non trovato");
  const q = block.questions.find((x) => x.id === body.questionId && x.type === "words");
  if (!q) throw new HttpError(404, "Domanda a parole non trovata");
  const db = getDb();
  let error: string | undefined;

  if (body.action === "redo") {
    const r = await ensureRank(q, block.title, me.id, { force: true });
    if (!r.rank) throw new HttpError(r.error && /profilo AI/.test(r.error) ? 400 : 502, r.error ?? "Scelta non riuscita");
  } else if (body.action === "clear") {
    const raw = (await questionResults([{ ...q, aiRank: null }])).get(q.id);
    const sig = raw?.type === "words" ? wordsSignature(raw.words) : "";
    await db
      .update(schema.questions)
      .set({ aiRank: { at: new Date().toISOString(), sig, order: [], discard: [], by: "manuale" } })
      .where(eq(schema.questions.id, q.id));
  } else if (body.action === "restore") {
    if (!q.aiRank || !body.key) throw new HttpError(400, "Niente da ripristinare");
    await db
      .update(schema.questions)
      .set({ aiRank: { ...q.aiRank, discard: q.aiRank.discard.filter((k) => k !== body.key) } })
      .where(eq(schema.questions.id, q.id));
  } else throw new HttpError(400, "Azione non valida");

  let revealUpdated = false;
  if (block.reveal) {
    try {
      revealUpdated = !!(await prepareReveal(ev.id, block.id, me.id));
    } catch (err) {
      error = `Prima/dopo non aggiornato: ${err instanceof Error ? err.message : "errore"}`;
    }
  }
  return NextResponse.json({ ok: true, revealUpdated, convergenceStale: !!ev.aiSummary, error });
});
