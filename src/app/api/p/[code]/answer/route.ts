import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { eventByCode, requireParticipant } from "@/lib/events";
import { AnswerError, myAnswerView, sanitizeAnswer, type AnswerInput, type QuestionConfig } from "@/lib/questions";
import { HttpError, api, readJson } from "@/lib/session";

type Ctx = { params: Promise<{ code: string }> };

/** Invio (o modifica) di una risposta: accettato solo sulla domanda aperta in quel momento. */
export const POST = api(async (req: Request, { params }: Ctx) => {
  const { code } = await params;
  const ev = await eventByCode(code);
  const me = await requireParticipant(req, ev.id);
  const body = await readJson<AnswerInput & { questionId?: string }>(req);

  if (!ev.activeQuestionId || body.questionId !== ev.activeQuestionId) {
    throw new HttpError(409, "Questa domanda è stata chiusa");
  }
  const db = getDb();
  const [q] = await db.select().from(schema.questions).where(eq(schema.questions.id, ev.activeQuestionId)).limit(1);
  if (!q) throw new HttpError(409, "Domanda non disponibile");
  if (q.type === "quiz" && q.revealed) throw new HttpError(409, "La soluzione è già stata mostrata");

  let values;
  try {
    values = sanitizeAnswer(q as QuestionConfig, body);
  } catch (e) {
    if (e instanceof AnswerError) throw new HttpError(400, e.message);
    throw e;
  }

  const [saved] = await db
    .insert(schema.answers)
    .values({ questionId: q.id, participantId: me.id, ...values })
    .onConflictDoUpdate({
      target: [schema.answers.questionId, schema.answers.participantId],
      set: { ...values, updatedAt: new Date() },
    })
    .returning();
  return NextResponse.json({ ok: true, answer: myAnswerView(q as QuestionConfig, saved) });
});
