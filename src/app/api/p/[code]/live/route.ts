import { NextResponse } from "next/server";
import {
  blocksWithQuestions,
  eventByCode,
  eventSummary,
  joinUrl,
  locateQuestion,
  overallTopWords,
  participantCount,
  qaList,
  questionLabel,
  questionResults,
} from "@/lib/events";
import { slimResult } from "@/lib/questions";
import { api } from "@/lib/session";

type Ctx = { params: Promise<{ code: string }> };

export const dynamic = "force-dynamic";

const noStore = { headers: { "cache-control": "no-store" } };

/** Dati per lo schermo del proiettore. Sola lettura, risposte anonime. */
export const GET = api(async (req: Request, { params }: Ctx) => {
  const { code } = await params;
  const ev = await eventByCode(code);
  const base = {
    title: ev.title,
    code: ev.code,
    joinUrl: joinUrl(req, ev.code),
    participants: await participantCount(ev.id),
    mode: ev.screenMode,
  };

  if (ev.screenMode === "qa" && ev.qaEnabled) {
    const qa = (await qaList(ev.id, { moderator: false })).filter((q) => q.status === "visible").slice(0, 8);
    return NextResponse.json({ ...base, qa }, noStore);
  }

  if (ev.screenMode === "insights") {
    return NextResponse.json({ ...base, insights: { ai: ev.aiSummary ?? null, top: await overallTopWords(ev.id) } }, noStore);
  }

  if (ev.screenMode === "final") {
    const summary = await eventSummary(ev.id);
    return NextResponse.json(
      {
        ...base,
        final: summary.map((b) => ({
          title: b.title,
          items: b.items.map((it) => ({ label: it.label, result: slimResult(it.result, 3) })),
        })),
      },
      noStore,
    );
  }

  if (ev.screenMode === "compare" && ev.screenBlockId) {
    const blocks = await blocksWithQuestions(ev.id);
    const b = blocks.find((x) => x.id === ev.screenBlockId);
    if (b) {
      const wordQs = b.questions.filter((q) => q.type === "words");
      // confronto tra la prima e l'ultima domanda a parole del blocco
      const pair = wordQs.length >= 2 ? [wordQs[0], wordQs[wordQs.length - 1]] : wordQs;
      const results = await questionResults(pair);
      return NextResponse.json(
        {
          ...base,
          compare: {
            title: b.title,
            sides: pair.map((q) => ({ label: questionLabel(q, b), result: slimResult(results.get(q.id)!, 40) })),
          },
        },
        noStore,
      );
    }
  }

  let active = null;
  if (ev.screenMode === "live" && ev.activeQuestionId) {
    const blocks = await blocksWithQuestions(ev.id);
    const loc = locateQuestion(blocks, ev.activeQuestionId);
    if (loc) {
      const { block: b, blockIndex, question: q } = loc;
      const result = (await questionResults([q])).get(q.id)!;
      active = {
        blockTitle: b.title,
        blockIndex: blockIndex + 1,
        blockCount: blocks.length,
        label: q.label,
        type: q.type,
        prompt: q.prompt,
        revealed: q.revealed,
        result: slimResult(
          // prima della rivelazione il proiettore non deve evidenziare la risposta giusta
          result.type === "quiz" && !q.revealed
            ? { ...result, options: result.options.map((o) => ({ ...o, correct: false })) }
            : result,
        ),
      };
    }
  }
  return NextResponse.json({ ...base, active }, noStore);
});
