import { and, eq, inArray, notInArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { blocksWithQuestions, eventById, joinUrl, participantCount, qaList, questionResults } from "@/lib/events";
import { AnswerError, headline, sanitizeConfig } from "@/lib/questions";
import { HttpError, api, readJson, requireOperator } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

/** Stato completo per la regia (interrogato periodicamente). */
export const GET = api(async (req: Request, { params }: Ctx) => {
  const me = await requireOperator();
  const { id } = await params;
  const ev = await eventById(id);
  const blocks = await blocksWithQuestions(ev.id);
  const results = await questionResults(blocks.flatMap((b) => b.questions));
  return NextResponse.json(
    {
      me: { role: me.role },
      event: ev,
      joinUrl: joinUrl(req, ev.code),
      participants: await participantCount(ev.id),
      blocks: blocks.map((b) => ({
        id: b.id,
        title: b.title,
        position: b.position,
        questions: b.questions.map((q) => {
          const r = results.get(q.id)!;
          return { ...q, respondents: r.respondents, headline: headline(r) };
        }),
      })),
      qa: ev.qaEnabled ? await qaList(ev.id, { moderator: true }) : [],
    },
    { headers: { "cache-control": "no-store" } },
  );
});

interface QuestionInput extends Record<string, unknown> {
  id?: string;
}
interface BlockInput {
  id?: string;
  title?: string;
  questions?: QuestionInput[];
}

/**
 * Aggiorna impostazioni e/o l'elenco completo di blocchi e domande.
 * Gli id esistenti vengono mantenuti (risposte comprese); ciò che manca viene eliminato.
 */
export const PATCH = api(async (req: Request, { params }: Ctx) => {
  await requireOperator();
  const { id } = await params;
  const ev = await eventById(id);
  const body = await readJson<{
    title?: string;
    qaEnabled?: boolean;
    qaModerated?: boolean;
    resultsPublished?: boolean;
    blocks?: BlockInput[];
  }>(req);

  const db = getDb();
  await db.transaction(async (tx) => {
    const patch: Partial<typeof schema.events.$inferInsert> = {};
    if (typeof body.title === "string" && body.title.trim()) patch.title = body.title.trim().slice(0, 120);
    if (typeof body.qaEnabled === "boolean") patch.qaEnabled = body.qaEnabled;
    if (typeof body.qaModerated === "boolean") patch.qaModerated = body.qaModerated;
    if (typeof body.resultsPublished === "boolean") patch.resultsPublished = body.resultsPublished;
    if (body.qaEnabled === false && ev.screenMode === "qa") patch.screenMode = "live";
    if (Object.keys(patch).length) await tx.update(schema.events).set(patch).where(eq(schema.events.id, ev.id));

    if (!Array.isArray(body.blocks)) return;

    // validazione completa prima di toccare il database
    const input = body.blocks.slice(0, 30).map((b) => {
      const title = (b.title ?? "").trim().slice(0, 80);
      if (!title) throw new HttpError(400, "Ogni blocco deve avere un titolo");
      let questions;
      try {
        questions = (Array.isArray(b.questions) ? b.questions : []).slice(0, 20).map((q) => ({
          id: typeof q.id === "string" ? q.id : undefined,
          ...sanitizeConfig(q, title),
        }));
      } catch (e) {
        if (e instanceof AnswerError) throw new HttpError(400, `${title} → ${e.message}`);
        throw e;
      }
      return { id: typeof b.id === "string" ? b.id : undefined, title, questions };
    });

    const existingBlocks = await tx.select().from(schema.blocks).where(eq(schema.blocks.eventId, ev.id));
    const existingQuestions = await tx.select().from(schema.questions).where(eq(schema.questions.eventId, ev.id));
    const keepBlockIds = input.map((b) => b.id).filter((x): x is string => !!x && existingBlocks.some((e) => e.id === x));
    const keepQuestionIds = input
      .flatMap((b) => b.questions.map((q) => q.id))
      .filter((x): x is string => !!x && existingQuestions.some((e) => e.id === x));

    // domande e blocchi rimossi (a cascata risposte e unioni)
    const removedQ = existingQuestions.filter((q) => !keepQuestionIds.includes(q.id)).map((q) => q.id);
    if (ev.activeQuestionId && removedQ.includes(ev.activeQuestionId)) {
      await tx.update(schema.events).set({ activeQuestionId: null }).where(eq(schema.events.id, ev.id));
    }
    if (removedQ.length) await tx.delete(schema.questions).where(inArray(schema.questions.id, removedQ));
    await tx
      .delete(schema.blocks)
      .where(
        keepBlockIds.length
          ? and(eq(schema.blocks.eventId, ev.id), notInArray(schema.blocks.id, keepBlockIds))
          : eq(schema.blocks.eventId, ev.id),
      );

    for (const [bi, b] of input.entries()) {
      let blockId = b.id && keepBlockIds.includes(b.id) ? b.id : undefined;
      if (blockId) {
        await tx.update(schema.blocks).set({ title: b.title, position: bi }).where(eq(schema.blocks.id, blockId));
      } else {
        const [nb] = await tx.insert(schema.blocks).values({ eventId: ev.id, position: bi, title: b.title }).returning();
        blockId = nb.id;
      }
      for (const [qi, q] of b.questions.entries()) {
        const { id: qid, ...cfg } = q;
        if (qid && keepQuestionIds.includes(qid)) {
          // cambio di tipo: le risposte già date non sono più compatibili
          const old = existingQuestions.find((e) => e.id === qid)!;
          if (old.type !== cfg.type) await tx.delete(schema.answers).where(eq(schema.answers.questionId, qid));
          // una domanda può anche spostarsi in un altro blocco
          await tx.update(schema.questions).set({ ...cfg, blockId, position: qi }).where(eq(schema.questions.id, qid));
        } else {
          await tx.insert(schema.questions).values({ ...cfg, eventId: ev.id, blockId, position: qi });
        }
      }
    }
  });
  return NextResponse.json({ ok: true });
});

export const DELETE = api(async (_req: Request, { params }: Ctx) => {
  await requireOperator();
  const { id } = await params;
  const ev = await eventById(id);
  await getDb().delete(schema.events).where(eq(schema.events.id, ev.id));
  return NextResponse.json({ ok: true });
});
