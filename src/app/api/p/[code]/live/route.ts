import { NextResponse } from "next/server";
import { blocksWithQuestions, eventByCode, eventSummary, joinUrl, participantCount, qaList, questionStats } from "@/lib/events";
import { api } from "@/lib/session";

type Ctx = { params: Promise<{ code: string }> };

export const dynamic = "force-dynamic";

const slim = (ws: { label: string; count: number }[], n = 60) => ws.slice(0, n).map((w) => ({ label: w.label, count: w.count }));

/** Dati per lo schermo del proiettore. Sola lettura, parole anonime. */
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
    return NextResponse.json({ ...base, qa }, { headers: { "cache-control": "no-store" } });
  }

  if (ev.screenMode === "final") {
    const summary = await eventSummary(ev.id);
    return NextResponse.json(
      {
        ...base,
        final: summary.map((b) => ({
          title: b.title,
          respondents: b.post.respondents,
          top: slim(b.post.top),
          preTop: slim(b.pre.top),
        })),
      },
      { headers: { "cache-control": "no-store" } },
    );
  }

  if (ev.screenMode === "compare" && ev.screenBlockId) {
    const blocks = await blocksWithQuestions(ev.id);
    const b = blocks.find((x) => x.id === ev.screenBlockId);
    if (b) {
      const s = await questionStats([b.pre.id, b.post.id]);
      return NextResponse.json(
        {
          ...base,
          compare: {
            title: b.title,
            pre: { respondents: s.get(b.pre.id)!.respondents, words: slim(s.get(b.pre.id)!.words, 40) },
            post: { respondents: s.get(b.post.id)!.respondents, words: slim(s.get(b.post.id)!.words, 40) },
          },
        },
        { headers: { "cache-control": "no-store" } },
      );
    }
  }

  let active = null;
  if (ev.screenMode === "live" && ev.activeQuestionId) {
    const blocks = await blocksWithQuestions(ev.id);
    const idx = blocks.findIndex((b) => b.pre.id === ev.activeQuestionId || b.post.id === ev.activeQuestionId);
    if (idx >= 0) {
      const b = blocks[idx];
      const q = b.pre.id === ev.activeQuestionId ? b.pre : b.post;
      const s = (await questionStats([q.id])).get(q.id)!;
      active = {
        blockTitle: b.title,
        blockIndex: idx + 1,
        blockCount: blocks.length,
        phase: q.phase,
        prompt: q.prompt,
        respondents: s.respondents,
        words: slim(s.words),
      };
    }
  }
  return NextResponse.json({ ...base, active }, { headers: { "cache-control": "no-store" } });
});
