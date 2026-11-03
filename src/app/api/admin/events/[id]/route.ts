import { and, eq, inArray, notInArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import {
  blocksWithQuestions,
  defaultPrompt,
  eventById,
  joinUrl,
  participantCount,
  qaList,
  questionStats,
} from "@/lib/events";
import { HttpError, api, readJson, requireOperator } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

/** Stato completo per la regia (interrogato periodicamente). */
export const GET = api(async (req: Request, { params }: Ctx) => {
  const me = await requireOperator();
  const { id } = await params;
  const ev = await eventById(id);
  const blocks = await blocksWithQuestions(ev.id);
  const stats = await questionStats(blocks.flatMap((b) => [b.pre.id, b.post.id]));
  const q = (x: typeof blocks[number]["pre"]) => ({
    id: x.id,
    prompt: x.prompt,
    maxWords: x.maxWords,
    respondents: stats.get(x.id)?.respondents ?? 0,
    top: (stats.get(x.id)?.words ?? []).slice(0, 3).map((w) => ({ label: w.label, count: w.count })),
  });
  return NextResponse.json(
    {
      me: { role: me.role },
      event: ev,
      joinUrl: joinUrl(req, ev.code),
      participants: await participantCount(ev.id),
      blocks: blocks.map((b) => ({ id: b.id, title: b.title, position: b.position, pre: q(b.pre), post: q(b.post) })),
      qa: ev.qaEnabled ? await qaList(ev.id, { moderator: true }) : [],
    },
    { headers: { "cache-control": "no-store" } },
  );
});

interface BlockInput {
  id?: string;
  title?: string;
  prePrompt?: string;
  postPrompt?: string;
  maxWords?: number;
}

/** Aggiorna impostazioni e/o l'elenco dei blocchi (sostituzione completa, mantenendo gli id). */
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

    if (Array.isArray(body.blocks)) {
      const input = body.blocks.slice(0, 30).map((b) => ({
        id: typeof b.id === "string" ? b.id : undefined,
        title: (b.title ?? "").trim().slice(0, 80),
        prePrompt: (b.prePrompt ?? "").trim().slice(0, 300),
        postPrompt: (b.postPrompt ?? "").trim().slice(0, 300),
        maxWords: Math.min(10, Math.max(1, Math.round(Number(b.maxWords) || 3))),
      }));
      if (input.some((b) => !b.title)) throw new HttpError(400, "Ogni blocco deve avere un titolo");

      const existing = await tx.select().from(schema.blocks).where(eq(schema.blocks.eventId, ev.id));
      const keepIds = input.map((b) => b.id).filter((x): x is string => !!x && existing.some((e) => e.id === x));

      // blocchi rimossi: elimina (a cascata domande, risposte e unioni)
      const removeWhere = keepIds.length
        ? and(eq(schema.blocks.eventId, ev.id), notInArray(schema.blocks.id, keepIds))
        : eq(schema.blocks.eventId, ev.id);
      const removed = await tx.select({ id: schema.blocks.id }).from(schema.blocks).where(removeWhere);
      if (removed.length) {
        const removedQ = await tx
          .select({ id: schema.questions.id })
          .from(schema.questions)
          .where(inArray(schema.questions.blockId, removed.map((r) => r.id)));
        if (ev.activeQuestionId && removedQ.some((q) => q.id === ev.activeQuestionId)) {
          await tx.update(schema.events).set({ activeQuestionId: null }).where(eq(schema.events.id, ev.id));
        }
        await tx.delete(schema.blocks).where(removeWhere);
      }

      for (const [i, b] of input.entries()) {
        const prePrompt = b.prePrompt || defaultPrompt(b.title, "pre");
        const postPrompt = b.postPrompt || defaultPrompt(b.title, "post");
        if (b.id && keepIds.includes(b.id)) {
          await tx.update(schema.blocks).set({ title: b.title, position: i }).where(eq(schema.blocks.id, b.id));
          await tx
            .update(schema.questions)
            .set({ prompt: prePrompt, maxWords: b.maxWords })
            .where(and(eq(schema.questions.blockId, b.id), eq(schema.questions.phase, "pre")));
          await tx
            .update(schema.questions)
            .set({ prompt: postPrompt, maxWords: b.maxWords })
            .where(and(eq(schema.questions.blockId, b.id), eq(schema.questions.phase, "post")));
        } else {
          const [nb] = await tx.insert(schema.blocks).values({ eventId: ev.id, position: i, title: b.title }).returning();
          await tx.insert(schema.questions).values([
            { eventId: ev.id, blockId: nb.id, phase: "pre", prompt: prePrompt, maxWords: b.maxWords },
            { eventId: ev.id, blockId: nb.id, phase: "post", prompt: postPrompt, maxWords: b.maxWords },
          ]);
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
