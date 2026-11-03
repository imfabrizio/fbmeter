import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { sha256 } from "./crypto";
import { HttpError } from "./session";
import { aggregate, topN, type AliasMap, type WordStat } from "./words";

export type EventRow = typeof schema.events.$inferSelect;
export type BlockRow = typeof schema.blocks.$inferSelect;
export type QuestionRow = typeof schema.questions.$inferSelect;
export type Phase = "pre" | "post";

export const defaultPrompt = (title: string, phase: Phase) =>
  phase === "pre"
    ? `Quando senti "${title}", quali parole ti vengono in mente?`
    : `Ora che ne abbiamo parlato: quali parole associ a "${title}"?`;

export async function eventByCode(code: string): Promise<EventRow> {
  const [ev] = await getDb()
    .select()
    .from(schema.events)
    .where(eq(schema.events.code, code.toUpperCase()))
    .limit(1);
  if (!ev) throw new HttpError(404, "Evento non trovato");
  return ev;
}

export async function eventById(id: string): Promise<EventRow> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, "Evento non trovato");
  const [ev] = await getDb().select().from(schema.events).where(eq(schema.events.id, id)).limit(1);
  if (!ev) throw new HttpError(404, "Evento non trovato");
  return ev;
}

export async function blocksWithQuestions(eventId: string) {
  const db = getDb();
  const blocks = await db
    .select()
    .from(schema.blocks)
    .where(eq(schema.blocks.eventId, eventId))
    .orderBy(asc(schema.blocks.position));
  const questions = await db.select().from(schema.questions).where(eq(schema.questions.eventId, eventId));
  return blocks.map((b) => ({
    ...b,
    pre: questions.find((q) => q.blockId === b.id && q.phase === "pre")!,
    post: questions.find((q) => q.blockId === b.id && q.phase === "post")!,
  }));
}

export type BlockWithQuestions = Awaited<ReturnType<typeof blocksWithQuestions>>[number];

/** Partecipante identificato dal token che il telefono invia nell'header. */
export async function participantFromRequest(req: Request, eventId: string) {
  const token = req.headers.get("x-participant-token");
  if (!token || token.length < 20) return null;
  const db = getDb();
  const [p] = await db
    .select()
    .from(schema.participants)
    .where(and(eq(schema.participants.tokenHash, sha256(token)), eq(schema.participants.eventId, eventId)))
    .limit(1);
  if (!p) return null;
  // aggiorna "visto di recente" al massimo una volta al minuto
  if (Date.now() - p.lastSeenAt.getTime() > 60_000) {
    await db.update(schema.participants).set({ lastSeenAt: new Date() }).where(eq(schema.participants.id, p.id));
  }
  return p;
}

export async function requireParticipant(req: Request, eventId: string) {
  const p = await participantFromRequest(req, eventId);
  if (!p) throw new HttpError(401, "Sessione partecipante non valida");
  return p;
}

async function aliasMaps(blockIds: string[]): Promise<Map<string, AliasMap>> {
  const out = new Map<string, AliasMap>();
  if (!blockIds.length) return out;
  const rows = await getDb().select().from(schema.aliases).where(inArray(schema.aliases.blockId, blockIds));
  for (const r of rows) {
    if (!out.has(r.blockId)) out.set(r.blockId, new Map());
    out.get(r.blockId)!.set(r.sourceKey, r.targetLabel);
  }
  return out;
}

export interface QuestionStats {
  questionId: string;
  respondents: number;
  words: WordStat[];
}

/** Statistiche di più domande in un colpo solo. */
export async function questionStats(questionIds: string[]): Promise<Map<string, QuestionStats>> {
  const out = new Map<string, QuestionStats>();
  if (!questionIds.length) return out;
  const db = getDb();
  const qs = await db.select().from(schema.questions).where(inArray(schema.questions.id, questionIds));
  const rows = await db
    .select({ questionId: schema.answers.questionId, words: schema.answers.words })
    .from(schema.answers)
    .where(inArray(schema.answers.questionId, questionIds));
  const maps = await aliasMaps([...new Set(qs.map((q) => q.blockId))]);
  for (const q of qs) {
    const words = rows.filter((r) => r.questionId === q.id).map((r) => r.words);
    out.set(q.id, {
      questionId: q.id,
      respondents: words.length,
      words: aggregate(words, maps.get(q.blockId)),
    });
  }
  return out;
}

export interface BlockSummary {
  id: string;
  position: number;
  title: string;
  pre: { respondents: number; top: WordStat[]; all: WordStat[] };
  post: { respondents: number; top: WordStat[]; all: WordStat[] };
  /** Parole del podio finale che non erano nel podio iniziale. */
  newInPost: string[];
}

export async function eventSummary(eventId: string): Promise<BlockSummary[]> {
  const blocks = await blocksWithQuestions(eventId);
  const stats = await questionStats(blocks.flatMap((b) => [b.pre.id, b.post.id]));
  return blocks.map((b) => {
    const pre = stats.get(b.pre.id)!;
    const post = stats.get(b.post.id)!;
    const preTop = topN(pre.words);
    const postTop = topN(post.words);
    const preKeys = new Set(preTop.map((w) => w.key));
    return {
      id: b.id,
      position: b.position,
      title: b.title,
      pre: { respondents: pre.respondents, top: preTop, all: pre.words },
      post: { respondents: post.respondents, top: postTop, all: post.words },
      newInPost: postTop.filter((w) => !preKeys.has(w.key)).map((w) => w.label),
    };
  });
}

export async function participantCount(eventId: string): Promise<number> {
  const [r] = await getDb()
    .select({ n: count() })
    .from(schema.participants)
    .where(eq(schema.participants.eventId, eventId));
  return r?.n ?? 0;
}

/** Elenco Q&A con voti. Per il pubblico: visibili e risposte (+ le proprie in attesa). */
export async function qaList(eventId: string, opts: { forParticipantId?: string; moderator?: boolean }) {
  const db = getDb();
  const rows = await db
    .select({
      id: schema.qaQuestions.id,
      text: schema.qaQuestions.text,
      status: schema.qaQuestions.status,
      createdAt: schema.qaQuestions.createdAt,
      participantId: schema.qaQuestions.participantId,
      nickname: schema.participants.nickname,
      votes: sql<number>`(select count(*)::int from ${schema.qaVotes} v where v.qa_question_id = ${schema.qaQuestions.id})`,
    })
    .from(schema.qaQuestions)
    .leftJoin(schema.participants, eq(schema.participants.id, schema.qaQuestions.participantId))
    .where(eq(schema.qaQuestions.eventId, eventId))
    .orderBy(desc(schema.qaQuestions.createdAt));

  let myVotes = new Set<string>();
  if (opts.forParticipantId) {
    const v = await db
      .select({ id: schema.qaVotes.qaQuestionId })
      .from(schema.qaVotes)
      .where(eq(schema.qaVotes.participantId, opts.forParticipantId));
    myVotes = new Set(v.map((x) => x.id));
  }

  const statusOrder: Record<string, number> = { pending: 0, visible: 1, answered: 2, hidden: 3 };
  return rows
    .filter(
      (r) =>
        opts.moderator ||
        r.status === "visible" ||
        r.status === "answered" ||
        (r.status === "pending" && r.participantId === opts.forParticipantId),
    )
    .map((r) => ({
      id: r.id,
      text: r.text,
      status: r.status,
      votes: Number(r.votes),
      nickname: r.nickname ?? "anonimo",
      mine: !!opts.forParticipantId && r.participantId === opts.forParticipantId,
      voted: myVotes.has(r.id),
      createdAt: r.createdAt.toISOString(),
    }))
    .sort(
      (a, b) =>
        (opts.moderator ? statusOrder[a.status] - statusOrder[b.status] : (a.status === "answered" ? 1 : 0) - (b.status === "answered" ? 1 : 0)) ||
        b.votes - a.votes ||
        b.createdAt.localeCompare(a.createdAt),
    );
}

export function joinUrl(req: Request, code: string): string {
  const base = process.env.APP_URL?.replace(/\/$/, "") || new URL(req.url).origin;
  return `${base}/e/${code}`;
}
