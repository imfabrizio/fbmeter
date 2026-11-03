import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { blocksWithQuestions, eventByCode, locateQuestion, participantFromRequest, qaList } from "@/lib/events";
import { myAnswerView, type QuestionConfig } from "@/lib/questions";
import { personalReveal, publicResults } from "@/lib/reveal";
import { api } from "@/lib/session";

type Ctx = { params: Promise<{ code: string }> };

export const dynamic = "force-dynamic";

const noStore = { headers: { "cache-control": "no-store" } };

/** Stato per il telefono del partecipante: interrogato periodicamente. */
export const GET = api(async (req: Request, { params }: Ctx) => {
  const { code } = await params;
  const ev = await eventByCode(code);
  const me = await participantFromRequest(req, ev.id);
  const eventInfo = { title: ev.title, code: ev.code, qaEnabled: ev.qaEnabled && !ev.resultsPublished, resultsPublished: ev.resultsPublished };
  const tokenRejected = !me && !!req.headers.get("x-participant-token");

  // risultati pubblicati: il telefono mostra solo quelli, nient'altro
  if (ev.resultsPublished) {
    return NextResponse.json(
      { event: eventInfo, me: me ? { nickname: me.nickname } : null, tokenRejected, active: null, results: await publicResults(ev.id, ev.aiSummary) },
      noStore,
    );
  }

  const blocks = await blocksWithQuestions(ev.id);
  let active = null;
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

  // suspense dopo la chiusura di un blocco, e poi la propria rivelazione
  let moment = null;
  if (!active && me && ev.teaserBlockId) {
    const block = blocks.find((b) => b.id === ev.teaserBlockId);
    const shown = (ev.screenMode === "reveal" || ev.screenMode === "compare") && ev.screenBlockId === ev.teaserBlockId;
    const p = block ? await personalReveal(block, me.id) : null;
    if (block && p && p.kind !== "none") {
      moment = shown
        ? { phase: "revealed", blockId: block.id, blockTitle: block.title, kind: p.kind, highlight: p.highlight, before: p.before, after: p.after }
        : { phase: "teaser", blockId: block.id, blockTitle: block.title, kind: p.kind };
    }
  }

  return NextResponse.json(
    {
      event: eventInfo,
      me: me ? { nickname: me.nickname } : null,
      tokenRejected,
      active,
      moment,
      qa: ev.qaEnabled && me ? await qaList(ev.id, { forParticipantId: me.id }) : undefined,
    },
    noStore,
  );
});
