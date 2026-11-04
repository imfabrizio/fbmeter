/**
 * Rivelazione prima/dopo di un blocco, strisce finali e corona di convergenza.
 * Tutto ciò che è calcolabile dai conteggi si calcola qui; l'AI aggiunge solo
 * collegamenti e temi, e se manca la chiave l'esperienza funziona lo stesso.
 */
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { generateLinks, generateThemes, type EvolutionLink, type Theme } from "./ai";
import { NoAiError, withAi } from "./aiProfiles";
import { blocksWithQuestions, eventById, questionResults, type BlockWithQuestions, type QuestionRow } from "./events";
import { headline, type QuestionResult } from "./questions";
import { wordKey, type WordStat } from "./words";

export interface RevealWord {
  label: string;
  count: number;
  key: string;
}

export interface BlockReveal {
  preparedAt: string;
  beforeLabel: string;
  afterLabel: string;
  beforeRespondents: number;
  afterRespondents: number;
  /** podio del prima senza le parole rimaste */
  before: RevealWord[];
  /** parole presenti in entrambi i podi */
  common: RevealWord[];
  /** podio del dopo senza le parole rimaste */
  after: RevealWord[];
  links: EvolutionLink[];
  note: string;
  ai: boolean;
  /** Profilo AI che ha risposto (solo per la regia). */
  aiLabel?: string;
}

/** Le due domande a parole confrontate: la prima e l'ultima del blocco. */
export function revealPair(block: BlockWithQuestions): [QuestionRow, QuestionRow] | null {
  const words = block.questions.filter((q) => q.type === "words");
  return words.length >= 2 ? [words[0], words[words.length - 1]] : null;
}

/** La domanda "risultato" di un blocco: quella a parole nel riepilogo, altrimenti l'ultima a parole. */
export function resultQuestion(block: BlockWithQuestions): QuestionRow | null {
  const words = block.questions.filter((q) => q.type === "words");
  return words.find((q) => q.inSummary) ?? words[words.length - 1] ?? block.questions.find((q) => q.inSummary) ?? null;
}

const top = (r: QuestionResult | undefined, n = 3): WordStat[] => (r?.type === "words" ? r.words.slice(0, n) : []);
const asReveal = (w: WordStat): RevealWord => ({ label: w.label, count: w.count, key: w.key });

/** Calcola (e con l'AI arricchisce) la rivelazione di un blocco, e la salva. */
export async function prepareReveal(eventId: string, blockId: string, operatorId: string | null): Promise<BlockReveal | null> {
  const blocks = await blocksWithQuestions(eventId);
  const block = blocks.find((b) => b.id === blockId);
  if (!block) return null;
  const pair = revealPair(block);
  if (!pair) return null;
  const results = await questionResults(pair);
  const pre = top(results.get(pair[0].id));
  const post = top(results.get(pair[1].id));
  const postKeys = new Set(post.map((w) => w.key));
  const preKeys = new Set(pre.map((w) => w.key));

  const reveal: BlockReveal = {
    preparedAt: new Date().toISOString(),
    beforeLabel: pair[0].label || "Prima",
    afterLabel: pair[1].label || "Dopo",
    beforeRespondents: results.get(pair[0].id)?.respondents ?? 0,
    afterRespondents: results.get(pair[1].id)?.respondents ?? 0,
    before: pre.filter((w) => !postKeys.has(w.key)).map(asReveal),
    common: post.filter((w) => preKeys.has(w.key)).map(asReveal),
    after: post.filter((w) => !preKeys.has(w.key)).map(asReveal),
    links: [],
    note: "",
    ai: false,
  };

  if (reveal.before.length && reveal.after.length) {
    try {
      const { result: r, used } = await withAi(operatorId, (ai) =>
        generateLinks(ai.provider, ai.model, ai.key, block.title, reveal.before, reveal.after),
      );
      reveal.links = r.links;
      reveal.note = r.note;
      reveal.ai = true;
      reveal.aiLabel = used.label;
    } catch (err) {
      if (!(err instanceof NoAiError)) console.error("Collegamenti AI non riusciti:", err);
    }
  }
  await getDb().update(schema.blocks).set({ reveal }).where(eq(schema.blocks.id, block.id));
  return reveal;
}

/* ------------------------------------------------------------------ */

export interface Strip {
  blockId: string;
  title: string;
  /** parole del podio finale, o una riga di sintesi se il blocco non ha domande a parole */
  words: { label: string; count: number }[];
  headline: string;
  respondents: number;
}

export interface CrownWord {
  label: string;
  count: number;
  blocks: string[];
}

export interface Convergence {
  version: 2;
  generatedAt: string;
  words: CrownWord[];
  themes: Theme[];
  note: string;
  ai: boolean;
  aiLabel?: string;
}

/** Strisce per argomento: tre parole grandi per blocco. */
export async function computeStrips(eventId: string): Promise<Strip[]> {
  const blocks = await blocksWithQuestions(eventId);
  const chosen = blocks.map((b) => ({ b, q: resultQuestion(b) }));
  const results = await questionResults(chosen.map((c) => c.q).filter((q): q is QuestionRow => !!q));
  return chosen
    .filter((c) => c.q)
    .map(({ b, q }) => {
      const r = results.get(q!.id)!;
      return {
        blockId: b.id,
        title: b.title,
        words: top(r).map((w) => ({ label: w.label, count: w.count })),
        headline: r.type === "words" ? "" : headline(r),
        respondents: r.respondents,
      };
    });
}

/**
 * Le 9 parole della corona: la più forte di ogni blocco, poi le altre del podio
 * con la quota più alta di persone. Parole uguali in blocchi diversi si fondono.
 */
export async function computeCrownWords(eventId: string, size = 9): Promise<CrownWord[]> {
  const blocks = await blocksWithQuestions(eventId);
  const chosen = blocks.map((b) => ({ b, q: resultQuestion(b) })).filter((c) => c.q?.type === "words");
  const results = await questionResults(chosen.map((c) => c.q!));
  const candidates = chosen.flatMap(({ b, q }, bi) => {
    const r = results.get(q!.id)!;
    return top(r).map((w, rank) => ({
      key: w.key,
      label: w.label,
      count: w.count,
      share: r.respondents ? w.count / r.respondents : 0,
      block: b.title,
      bi,
      rank,
    }));
  });
  const merged = new Map<string, CrownWord & { share: number; firstOfBlock: boolean }>();
  for (const c of candidates) {
    const m = merged.get(c.key);
    if (m) {
      m.count += c.count;
      m.share += c.share;
      if (!m.blocks.includes(c.block)) m.blocks.push(c.block);
      m.firstOfBlock ||= c.rank === 0;
    } else merged.set(c.key, { label: c.label, count: c.count, blocks: [c.block], share: c.share, firstOfBlock: c.rank === 0 });
  }
  const all = [...merged.values()].sort((a, b) => b.share - a.share);
  const picked = [...all.filter((w) => w.firstOfBlock), ...all.filter((w) => !w.firstOfBlock)].slice(0, size);
  return picked.sort((a, b) => b.share - a.share).map(({ label, count, blocks }) => ({ label, count, blocks }));
}

/** Prepara la convergenza finale (9 parole → 3 temi) e la salva sull'evento. */
export async function prepareConvergence(eventId: string, operatorId: string): Promise<Convergence> {
  const ev = await eventById(eventId);
  const words = await computeCrownWords(eventId);
  const conv: Convergence = { version: 2, generatedAt: new Date().toISOString(), words, themes: [], note: "", ai: false };
  if (words.length < 3) throw new ConvergenceError("Servono più risposte nelle domande di fine blocco");
  try {
    const { result: r, used } = await withAi(operatorId, (ai) => generateThemes(ai.provider, ai.model, ai.key, ev.title, words));
    conv.themes = r.themes;
    conv.note = r.note;
    conv.ai = true;
    conv.aiLabel = used.label;
  } catch (err) {
    if (err instanceof NoAiError) throw new ConvergenceError("Configura prima un profilo AI in Impostazioni AI: i macro-temi li genera l'AI");
    throw new ConvergenceError(err instanceof Error ? err.message : "Errore AI");
  }
  await getDb().update(schema.events).set({ aiSummary: conv }).where(eq(schema.events.id, eventId));
  return conv;
}

export class ConvergenceError extends Error {}

/** Convergenza salvata (solo il formato attuale). */
export function savedConvergence(aiSummary: unknown): Convergence | null {
  const c = aiSummary as Convergence | null;
  return c && c.version === 2 && Array.isArray(c.themes) ? c : null;
}

/** Risultati pubblici completi: strisce + corona. */
export async function publicResults(eventId: string, aiSummary: unknown) {
  const strips = await computeStrips(eventId);
  const saved = savedConvergence(aiSummary);
  const words = saved?.words ?? (await computeCrownWords(eventId));
  return { strips, crown: { words, themes: saved?.themes ?? [], note: saved?.note ?? "", generatedAt: saved?.generatedAt ?? null } };
}

/* ------------------------------------------------------------------ */

/**
 * Messaggio personale per il telefono: dopo la chiusura del blocco (teaser, senza svelare)
 * e dopo la rivelazione (con le parole della persona evidenziate).
 */
export async function personalReveal(block: BlockWithQuestions, participantId: string) {
  const pair = revealPair(block);
  if (!pair) return null;
  const results = await questionResults(pair);
  const postTop = top(results.get(pair[1].id));
  const preTop = top(results.get(pair[0].id));
  const mine = await getDb()
    .select({ questionId: schema.answers.questionId, words: schema.answers.words })
    .from(schema.answers)
    .where(eq(schema.answers.participantId, participantId));
  const keysOf = (qid: string) => new Set((mine.find((m) => m.questionId === qid)?.words ?? []).map(wordKey));
  const myPost = keysOf(pair[1].id);
  const myPre = keysOf(pair[0].id);
  const postKeys = new Set(postTop.map((w) => w.key));
  const aliasTarget = new Map(postTop.flatMap((w) => w.forms.map((f) => [wordKey(f.text), w.key] as const)));
  const hit = (k: string) => postKeys.has(k) || postKeys.has(aliasTarget.get(k) ?? "");

  const kind = [...myPost].some(hit)
    ? "podium"
    : [...myPre].some(hit)
      ? "anticipated"
      : myPost.size || myPre.size
        ? "participated"
        : "none";
  const highlight = postTop
    .filter((w) => [...myPost, ...myPre].some((k) => k === w.key || aliasTarget.get(k) === w.key))
    .map((w) => w.label);
  return {
    kind,
    highlight,
    before: preTop.map((w) => w.label),
    after: postTop.map((w) => w.label),
  };
}
