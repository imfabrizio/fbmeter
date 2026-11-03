import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { eventByCode, requireParticipant } from "@/lib/events";
import { HttpError, api } from "@/lib/session";

type Ctx = { params: Promise<{ code: string; qid: string }> };

/** Mette o toglie il "+1" su una domanda. */
export const POST = api(async (req: Request, { params }: Ctx) => {
  const { code, qid } = await params;
  const ev = await eventByCode(code);
  if (!ev.qaEnabled) throw new HttpError(403, "Le domande non sono attive");
  const me = await requireParticipant(req, ev.id);
  const db = getDb();
  const [q] = await db
    .select()
    .from(schema.qaQuestions)
    .where(and(eq(schema.qaQuestions.id, qid), eq(schema.qaQuestions.eventId, ev.id)))
    .limit(1);
  if (!q || q.status !== "visible") throw new HttpError(404, "Domanda non disponibile");

  const where = and(eq(schema.qaVotes.qaQuestionId, qid), eq(schema.qaVotes.participantId, me.id));
  const [existing] = await db.select().from(schema.qaVotes).where(where).limit(1);
  if (existing) await db.delete(schema.qaVotes).where(where);
  else await db.insert(schema.qaVotes).values({ qaQuestionId: qid, participantId: me.id }).onConflictDoNothing();
  return NextResponse.json({ voted: !existing });
});
