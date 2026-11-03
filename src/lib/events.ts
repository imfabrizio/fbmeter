import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { sha256 } from "./crypto";
import { computeResult, type AnswerRow, type QuestionConfig, type QuestionResult } from "./questions";
import { HttpError } from "./session";
import type { AliasMap, WordStat } from "./words";

export type EventRow = typeof schema.events.$inferSelect;
export type BlockRow = typeof schema.blocks.$inferSelect;
export type QuestionRow = typeof schema.questions.$inferSelect;

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

/** Blocchi in ordine, ciascuno con le sue domande in ordine. */
export async function blocksWithQuestions(eventId: string) {
  const db = getDb();
  const blocks = await db
    .select()
    .from(schema.blocks)
    .where(eq(schema.blocks.eventId, eventId))
    .orderBy(asc(schema.blocks.position));
  const questions = await db
    .select()
    .from(schema.questions)
    .where(eq(schema.questions.eventId, eventId))
    .orderBy(asc(schema.questions.position));
  return blocks.map((b) => ({ ...b, questions: questions.filter((q) => q.blockId === b.id) }));
}

export type BlockWithQuestions = Awaited<ReturnType<typeof blocksWithQuestions>>[number];

/** Trova blocco, indice e domanda a partire dall'id della domanda. */
export function locateQuestion(blocks: BlockWithQuestions[], questionId: string | null) {
  if (!questionId) return null;
  for (const [blockIndex, block] of blocks.entries()) {
    const question = block.questions.find((q) => q.id === questionId);
    if (question) return { block, blockIndex, question };
  }
  return null;
}

/** Etichetta di una domanda per la regia: quella scelta, o "Domanda N". */
export function questionLabel(q: QuestionRow, block: BlockWithQuestions) {
  return q.label || `Domanda ${block.questions.findIndex((x) => x.id === q.id) + 1}`;
}

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

export async function aliasMaps(blockIds: string[]): Promise<Map<string, AliasMap>> {
  const out = new Map<string, AliasMap>();
  if (!blockIds.length) return out;
  const rows = await getDb().select().from(schema.aliases).where(inArray(schema.aliases.blockId, blockIds));
  for (const r of rows) {
    if (!out.has(r.blockId)) out.set(r.blockId, new Map());
    out.get(r.blockId)!.set(r.sourceKey, r.targetLabel);
  }
  return out;
}

/** Risultati di più domande in un colpo solo. */
export async function questionResults(questions: QuestionRow[]): Promise<Map<string, QuestionResult>> {
  const out = new Map<string, QuestionResult>();
  if (!questions.length) return out;
  const rows = await getDb()
    .select({
      questionId: schema.answers.questionId,
      words: schema.answers.words,
      choices: schema.answers.choices,
      scale: schema.answers.scale,
      textValue: schema.answers.textValue,
      updatedAt: schema.answers.updatedAt,
      nickname: schema.participants.nickname,
    })
    .from(schema.answers)
    .innerJoin(schema.participants, eq(schema.participants.id, schema.answers.participantId))
    .where(inArray(schema.answers.questionId, questions.map((q) => q.id)));
  const maps = await aliasMaps([...new Set(questions.map((q) => q.blockId))]);
  for (const q of questions) {
    const answers: AnswerRow[] = rows.filter((r) => r.questionId === q.id);
    out.set(q.id, computeResult(q as QuestionConfig, answers, maps.get(q.blockId)));
  }
  return out;
}

export interface SummaryItem {
  questionId: string;
  label: string;
  prompt: string;
  result: QuestionResult;
  /** Solo parole: la domanda a parole precedente nello stesso blocco, per il confronto prima/dopo. */
  before?: { label: string; respondents: number; top: WordStat[] };
  /** Solo parole: voci del podio che non erano nel podio della domanda precedente. */
  newWords?: string[];
}

export interface BlockSummary {
  id: string;
  position: number;
  title: string;
  items: SummaryItem[];
}

/** Riepilogo finale: per ogni blocco, le domande segnate "nel riepilogo". */
export async function eventSummary(eventId: string, opts: { all?: boolean } = {}): Promise<BlockSummary[]> {
  const blocks = await blocksWithQuestions(eventId);
  const results = await questionResults(blocks.flatMap((b) => b.questions));
  return blocks
    .map((b) => {
      const items: SummaryItem[] = [];
      for (const [i, q] of b.questions.entries()) {
        if (!opts.all && !q.inSummary) continue;
        const result = results.get(q.id)!;
        const item: SummaryItem = { questionId: q.id, label: questionLabel(q, b), prompt: q.prompt, result };
        if (result.type === "words") {
          const prev = [...b.questions.slice(0, i)].reverse().find((x) => x.type === "words");
          if (prev) {
            const pr = results.get(prev.id)!;
            if (pr.type === "words") {
              const top = pr.words.slice(0, 3);
              const keys = new Set(top.map((w) => w.key));
              item.before = { label: questionLabel(prev, b), respondents: pr.respondents, top };
              item.newWords = result.words.slice(0, 3).filter((w) => !keys.has(w.key)).map((w) => w.label);
            }
          }
        }
        items.push(item);
      }
      return { id: b.id, position: b.position, title: b.title, items };
    })
    .filter((b) => b.items.length > 0 || opts.all);
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
        (opts.moderator
          ? statusOrder[a.status] - statusOrder[b.status]
          : (a.status === "answered" ? 1 : 0) - (b.status === "answered" ? 1 : 0)) ||
        b.votes - a.votes ||
        b.createdAt.localeCompare(a.createdAt),
    );
}

export function joinUrl(req: Request, code: string): string {
  const base = process.env.APP_URL?.replace(/\/$/, "") || new URL(req.url).origin;
  return `${base}/e/${code}`;
}

/**
 * Parole più scritte in tutto l'evento, senza AI: somma le domande a parole del riepilogo
 * (o tutte quelle a parole, se nessuna è nel riepilogo), unioni di ogni blocco applicate.
 */
export async function overallTopWords(eventId: string, n = 5): Promise<{ label: string; count: number }[]> {
  const blocks = await blocksWithQuestions(eventId);
  const all = blocks.flatMap((b) => b.questions).filter((q) => q.type === "words");
  const chosen = all.some((q) => q.inSummary) ? all.filter((q) => q.inSummary) : all;
  const results = await questionResults(chosen);
  const merged = new Map<string, { label: string; count: number }>();
  for (const r of results.values()) {
    if (r.type !== "words") continue;
    for (const w of r.words) {
      const m = merged.get(w.key) ?? { label: w.label, count: 0 };
      m.count += w.count;
      merged.set(w.key, m);
    }
  }
  return [...merged.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "it")).slice(0, n);
}
