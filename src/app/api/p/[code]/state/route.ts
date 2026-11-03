import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { blocksWithQuestions, eventByCode, locateQuestion, participantFromRequest, qaList } from "@/lib/events";
import { myAnswerView, type QuestionConfig } from "@/lib/questions";
import { api } from "@/lib/session";

type Ctx = { params: Promise<{ code: string }> };

export const dynamic = "force-dynamic";

/** Stato per il telefono del partecipante: interrogato periodicamente. */
export const GET = api(async (req: Request, { params }: Ctx) => {
  const { code } = await params;
  const ev = await eventByCode(code);
  const me = await participantFromRequest(req, ev.id);

  let active = null;
  if (ev.activeQuestionId) {
    const blocks = await blocksWithQuestions(ev.id);
    const loc = locateQuestion(blocks, ev.activeQuestionId);
    if (loc) {
      const { block: b, blockIndex, question: q } = loc;
      let myAnswer = null;
      if (me) {
        const [a] = await getDb()
          .select()
          .from(schema.answers)
          .where(and(eq(schema.answers.questionId, q.id), eq(schema.answers.participantId, me.id)))
          .limit(1);
        myAnswer = myAnswerView(q as QuestionConfig, a);
      }
      active = {
        id: q.id,
        type: q.type,
        label: q.label,
        prompt: q.prompt,
        maxWords: q.maxWords,
        options: q.options,
        multiple: q.multiple,
        scaleMin: q.scaleMin,
        scaleMax: q.scaleMax,
        scaleMinLabel: q.scaleMinLabel,
        scaleMaxLabel: q.scaleMaxLabel,
        // la soluzione del quiz arriva al telefono solo dopo che la regia l'ha rivelata
        correct: q.type === "quiz" && q.revealed ? q.correct : null,
        blockTitle: b.title,
        blockIndex: blockIndex + 1,
        blockCount: blocks.length,
        myAnswer,
      };
    }
  }

  return NextResponse.json(
    {
      event: { title: ev.title, code: ev.code, qaEnabled: ev.qaEnabled, resultsPublished: ev.resultsPublished },
      me: me ? { nickname: me.nickname } : null,
      // il telefono ha inviato un token che non esiste più (es. evento azzerato)
      tokenRejected: !me && !!req.headers.get("x-participant-token"),
      active,
      qa: ev.qaEnabled && me ? await qaList(ev.id, { forParticipantId: me.id }) : undefined,
    },
    { headers: { "cache-control": "no-store" } },
  );
});
