import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { blocksWithQuestions, eventByCode, joinUrl, locateQuestion, participantCount, qaList, questionResults } from "@/lib/events";
import { slimResult } from "@/lib/questions";
import { computeStrips, publicResults, type BlockReveal } from "@/lib/reveal";
import { api } from "@/lib/session";
import { eq } from "drizzle-orm";

type Ctx = { params: Promise<{ code: string }> };

export const dynamic = "force-dynamic";

const noStore = { headers: { "cache-control": "no-store" } };

/** Valori di versioni precedenti */
const LEGACY: Record<string, string> = { final: "strips", insights: "strips", compare: "reveal" };

/** Dati per lo schermo del proiettore. Sola lettura, risposte anonime. */
export const GET = api(async (req: Request, { params }: Ctx) => {
  const { code } = await params;
  const ev = await eventByCode(code);
  const mode = LEGACY[ev.screenMode] ?? ev.screenMode;
  const base = {
    title: ev.title,
    code: ev.code,
    joinUrl: joinUrl(req, ev.code),
    participants: await participantCount(ev.id),
    mode,
  };

  if (mode === "qa" && ev.qaEnabled) {
    const qa = (await qaList(ev.id, { moderator: false })).filter((q) => q.status === "visible").slice(0, 8);
    return NextResponse.json({ ...base, qa }, noStore);
  }

  if (mode === "strips") {
    return NextResponse.json({ ...base, strips: await computeStrips(ev.id) }, noStore);
  }

  if (mode === "crown") {
    const { crown } = await publicResults(ev.id, ev.aiSummary);
    return NextResponse.json({ ...base, crown }, noStore);
  }

  if (mode === "reveal" && ev.screenBlockId) {
    const [b] = await getDb().select().from(schema.blocks).where(eq(schema.blocks.id, ev.screenBlockId)).limit(1);
    if (b?.reveal) {
      return NextResponse.json({ ...base, reveal: { blockId: b.id, title: b.title, ...(b.reveal as BlockReveal) } }, noStore);
    }
    return NextResponse.json({ ...base, mode: "preparing", preparingTitle: b?.title ?? "" }, noStore);
  }

  let active = null;
  if (mode === "live" && ev.activeQuestionId) {
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
          result.type === "quiz" && !q.revealed ? { ...result, options: result.options.map((o) => ({ ...o, correct: false })) } : result,
        ),
      };
    }
  }
  return NextResponse.json({ ...base, active }, noStore);
});
