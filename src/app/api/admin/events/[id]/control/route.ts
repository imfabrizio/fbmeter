import { and, eq } from "drizzle-orm";
import { NextResponse, after } from "next/server";
import { getDb, schema } from "@/db";
import { blocksWithQuestions, eventById, locateQuestion } from "@/lib/events";
import { prepareReveal, revealPair } from "@/lib/reveal";
import { HttpError, api, readJson, requireOperator } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

export const maxDuration = 60;

/** live: domanda aperta · join: QR grande · reveal: prima/dopo di un blocco · strips: risultato per argomento · crown: convergenza · qa */
const SCREEN_MODES = new Set(["live", "join", "reveal", "strips", "crown", "qa"]);

/**
 * Regia: quale domanda è aperta e cosa mostra il proiettore.
 * Aprire una domanda chiude automaticamente la precedente (ne è aperta una sola).
 * Chiudere l'ultima domanda a parole di un blocco prepara la rivelazione prima/dopo
 * e fa partire il messaggio di suspense sui telefoni.
 */
export const POST = api(async (req: Request, { params }: Ctx) => {
  const me = await requireOperator();
  const { id } = await params;
  const ev = await eventById(id);
  const body = await readJson<{
    activeQuestionId?: string | null;
    screenMode?: string;
    screenBlockId?: string | null;
    reveal?: { questionId: string; revealed: boolean };
  }>(req);
  const db = getDb();
  const patch: Partial<typeof schema.events.$inferInsert> = {};

  // quiz: mostra o nasconde la soluzione al pubblico e sul proiettore
  if (body.reveal && typeof body.reveal.questionId === "string") {
    await db
      .update(schema.questions)
      .set({ revealed: body.reveal.revealed === true })
      .where(and(eq(schema.questions.id, body.reveal.questionId), eq(schema.questions.eventId, ev.id)));
  }

  const changingQuestion = body.activeQuestionId !== undefined && body.activeQuestionId !== ev.activeQuestionId;
  if (body.activeQuestionId === null) patch.activeQuestionId = null;
  else if (typeof body.activeQuestionId === "string") {
    const [q] = await db
      .select({ id: schema.questions.id })
      .from(schema.questions)
      .where(and(eq(schema.questions.id, body.activeQuestionId), eq(schema.questions.eventId, ev.id)))
      .limit(1);
    if (!q) throw new HttpError(404, "Domanda non trovata");
    patch.activeQuestionId = q.id;
    // aprendo una domanda il proiettore torna sulla domanda aperta
    if (body.screenMode === undefined) patch.screenMode = "live";
  }

  // si sta chiudendo la domanda di fine di un blocco? → suspense sui telefoni + preparazione
  let closedBlockId: string | null = null;
  if (changingQuestion && ev.activeQuestionId) {
    const blocks = await blocksWithQuestions(ev.id);
    const loc = locateQuestion(blocks, ev.activeQuestionId);
    const pair = loc ? revealPair(loc.block) : null;
    if (loc && pair && pair[1].id === ev.activeQuestionId) {
      closedBlockId = loc.block.id;
      patch.teaserBlockId = loc.block.id;
      patch.teaserRevealed = false;
      if (body.screenMode === undefined && body.activeQuestionId === null) patch.screenBlockId = loc.block.id;
    }
  }

  if (typeof body.screenMode === "string") {
    if (!SCREEN_MODES.has(body.screenMode)) throw new HttpError(400, "Modalità schermo non valida");
    if (body.screenMode === "qa" && !ev.qaEnabled) throw new HttpError(400, "Le domande non sono attive");
    patch.screenMode = body.screenMode;
    // passando al finale, un eventuale prima/dopo non mostrato non resta più "in sospeso"
    if ((body.screenMode === "strips" || body.screenMode === "crown") && (patch.teaserBlockId ?? ev.teaserBlockId)) patch.teaserRevealed = true;
  }
  if (body.screenBlockId !== undefined) patch.screenBlockId = body.screenBlockId;

  if (Object.keys(patch).length) await db.update(schema.events).set(patch).where(eq(schema.events.id, ev.id));

  // la preparazione (con l'AI) gira dopo la risposta, così la regia non aspetta
  if (closedBlockId) {
    const blockId = closedBlockId;
    after(async () => {
      try {
        await prepareReveal(ev.id, blockId, me.id);
      } catch (err) {
        console.error("Preparazione rivelazione non riuscita:", err);
      }
    });
  }
  return NextResponse.json({ ok: true, preparing: closedBlockId });
});
