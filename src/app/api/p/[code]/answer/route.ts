import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { eventByCode, requireParticipant } from "@/lib/events";
import { HttpError, api, readJson } from "@/lib/session";
import { sanitizeSubmission } from "@/lib/words";

type Ctx = { params: Promise<{ code: string }> };

/** Invio (o modifica) delle parole: accettato solo sulla domanda aperta in quel momento. */
export const POST = api(async (req: Request, { params }: Ctx) => {
  const { code } = await params;
  const ev = await eventByCode(code);
  const me = await requireParticipant(req, ev.id);
  const body = await readJson<{ questionId?: string; words?: unknown }>(req);

  if (!ev.activeQuestionId || body.questionId !== ev.activeQuestionId) {
    throw new HttpError(409, "Questa domanda è stata chiusa");
  }
  const db = getDb();
  const [q] = await db.select().from(schema.questions).where(eq(schema.questions.id, ev.activeQuestionId)).limit(1);
  if (!q) throw new HttpError(409, "Domanda non disponibile");

  const words = sanitizeSubmission(body.words, q.maxWords);
  if (!words.length) throw new HttpError(400, "Scrivi almeno una parola");

  await db
    .insert(schema.answers)
    .values({ questionId: q.id, participantId: me.id, words })
    .onConflictDoUpdate({
      target: [schema.answers.questionId, schema.answers.participantId],
      set: { words, updatedAt: new Date() },
    });
  return NextResponse.json({ ok: true, words });
});
