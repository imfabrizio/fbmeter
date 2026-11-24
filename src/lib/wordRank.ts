import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { rankWordsAI } from "./ai";
import { NoAiError, withAi } from "./aiProfiles";
import { questionResults, type QuestionRow } from "./events";
import { wordsSignature, type WordRank } from "./words";

/** Quante voci al massimo mandare all'AI (le più scritte). */
const MAX_WORDS = 80;

/**
 * Fa (o rifà) la scelta AI di una domanda a parole: ordine a parità di persone e voci
 * scartate. Se le risposte non sono cambiate dall'ultima scelta non fa nulla.
 * Senza profilo AI resta l'ordine automatico (persone, poi parentele tra parole).
 */
export async function ensureRank(
  q: QuestionRow,
  topic: string,
  operatorId: string | null,
  opts: { force?: boolean } = {},
): Promise<{ rank: WordRank | null; error?: string }> {
  if (q.type !== "words") return { rank: null };
  // le voci "grezze", senza la scelta precedente, per firmarle e mandarle all'AI
  const r = (await questionResults([{ ...q, aiRank: null }])).get(q.id);
  if (!r || r.type !== "words") return { rank: null };
  const sig = wordsSignature(r.words);
  if (!opts.force && q.aiRank && q.aiRank.sig === sig) return { rank: q.aiRank };

  const save = async (rank: WordRank) => {
    await getDb().update(schema.questions).set({ aiRank: rank }).where(eq(schema.questions.id, q.id));
    return rank;
  };
  const words = r.words.slice(0, MAX_WORDS);
  // con 3 voci o meno non c'è niente da scegliere
  if (words.length <= 3) return { rank: await save({ at: new Date().toISOString(), sig, order: [], discard: [], by: "" }) };

  try {
    const { result, used } = await withAi(operatorId, (ai) =>
      rankWordsAI(ai, topic, q.prompt, words.map((w) => ({ label: w.label, count: w.count }))),
    );
    return {
      rank: await save({
        at: new Date().toISOString(),
        sig,
        order: result.order.map((i) => words[i].key),
        discard: result.discard.map((i) => words[i].key),
        by: used.label,
      }),
    };
  } catch (err) {
    if (err instanceof NoAiError) return { rank: null, error: err.message };
    console.error("Scelta AI delle parole non riuscita:", err);
    return { rank: null, error: err instanceof Error ? err.message : "Errore AI" };
  }
}

/**
 * Prepara la scelta per più domande in parallelo, senza mai bloccare la regia oltre
 * `timeoutMs`: allo scadere si va avanti con l'ordine automatico.
 */
export async function ensureRanks(items: { q: QuestionRow; topic: string }[], operatorId: string | null, timeoutMs = 20000) {
  const work = Promise.allSettled(items.filter((i) => i.q.type === "words").map((i) => ensureRank(i.q, i.topic, operatorId)));
  await Promise.race([work, new Promise((r) => setTimeout(r, timeoutMs))]);
}
