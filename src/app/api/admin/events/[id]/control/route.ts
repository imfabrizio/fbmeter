import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { eventById } from "@/lib/events";
import { HttpError, api, readJson, requireOperator } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

const SCREEN_MODES = new Set(["live", "join", "compare", "final", "qa"]);

/**
 * Regia: quale domanda è aperta e cosa mostra il proiettore.
 * Aprire una domanda chiude automaticamente la precedente (ne è aperta una sola).
 */
export const POST = api(async (req: Request, { params }: Ctx) => {
  await requireOperator();
  const { id } = await params;
  const ev = await eventById(id);
  const body = await readJson<{ activeQuestionId?: string | null; screenMode?: string; screenBlockId?: string | null }>(req);
  const db = getDb();
  const patch: Partial<typeof schema.events.$inferInsert> = {};

  if (body.activeQuestionId === null) patch.activeQuestionId = null;
  else if (typeof body.activeQuestionId === "string") {
    const [q] = await db
      .select({ id: schema.questions.id })
      .from(schema.questions)
      .where(and(eq(schema.questions.id, body.activeQuestionId), eq(schema.questions.eventId, ev.id)))
      .limit(1);
    if (!q) throw new HttpError(404, "Domanda non trovata");
    patch.activeQuestionId = q.id;
    // aprendo una domanda il proiettore torna sulla nuvola live
    if (body.screenMode === undefined) patch.screenMode = "live";
  }

  if (typeof body.screenMode === "string") {
    if (!SCREEN_MODES.has(body.screenMode)) throw new HttpError(400, "Modalità schermo non valida");
    if (body.screenMode === "qa" && !ev.qaEnabled) throw new HttpError(400, "Le domande non sono attive");
    patch.screenMode = body.screenMode;
  }
  if (body.screenBlockId !== undefined) patch.screenBlockId = body.screenBlockId;

  if (Object.keys(patch).length) await db.update(schema.events).set(patch).where(eq(schema.events.id, ev.id));
  return NextResponse.json({ ok: true });
});
