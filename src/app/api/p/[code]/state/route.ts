import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { blocksWithQuestions, eventByCode, participantFromRequest, qaList } from "@/lib/events";
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
    const idx = blocks.findIndex((b) => b.pre.id === ev.activeQuestionId || b.post.id === ev.activeQuestionId);
    if (idx >= 0) {
      const b = blocks[idx];
      const q = b.pre.id === ev.activeQuestionId ? b.pre : b.post;
      let myWords: string[] | null = null;
      if (me) {
        const [a] = await getDb()
          .select({ words: schema.answers.words })
          .from(schema.answers)
          .where(and(eq(schema.answers.questionId, q.id), eq(schema.answers.participantId, me.id)))
          .limit(1);
        myWords = a?.words ?? null;
      }
      active = {
        id: q.id,
        phase: q.phase,
        prompt: q.prompt,
        maxWords: q.maxWords,
        blockTitle: b.title,
        blockIndex: idx + 1,
        blockCount: blocks.length,
        myWords,
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
