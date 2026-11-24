/**
 * Normalizzazione e aggregazione delle parole.
 *
 * Livello 1 (automatico): maiuscole, accenti, punteggiatura, articoli iniziali e
 * desinenze singolare/plurale ("utente" = "utenti", "user" = "users", "identità" = "identita").
 * Livello 2 (decisione umana o AI confermata): alias per blocco ("utenti" → "identità").
 *
 * Le parole sono salvate grezze: migliorare questa funzione ricalcola tutto
 * retroattivamente, senza toccare i dati.
 */

export const MAX_WORD_LENGTH = 40;

const LEADING_ARTICLES = new Set([
  "il", "lo", "la", "i", "gli", "le", "l", "un", "uno", "una", "un'",
  "the", "a", "an",
]);

/** Ripulisce il testo come l'ha scritto la persona (per la visualizzazione). */
export function cleanWord(raw: string): string {
  return raw.normalize("NFC").replace(/\s+/g, " ").trim().slice(0, MAX_WORD_LENGTH);
}

function stem(token: string): string {
  if (token.length <= 3 || /\d/.test(token)) return token;
  let t = token;
  if (t.length > 4 && t.endsWith("s") && !t.endsWith("ss")) t = t.slice(0, -1);
  if (t.length > 3 && /[aeiou]$/.test(t)) t = t.slice(0, -1);
  return t;
}

/** Chiave di confronto: due parole con la stessa chiave contano come una. */
export function wordKey(raw: string): string {
  const base = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const tokens = base.split(" ").filter(Boolean);
  while (tokens.length > 1 && LEADING_ARTICLES.has(tokens[0])) tokens.shift();
  return tokens.map(stem).join(" ");
}

export type AliasMap = Map<string, string>; // sourceKey → targetLabel

export interface WordStat {
  key: string;
  label: string;
  count: number;
  /** Forme originali confluite nella voce, con quante volte sono state scritte. */
  forms: { text: string; count: number }[];
  merged: boolean;
  /** Scartata dalla revisione AI (senza senso, battuta, fuori tema): va in fondo e non va sul proiettore. */
  discarded?: boolean;
}

/**
 * Scelta salvata per una domanda a parole: a parità di persone, l'ordine di
 * rappresentatività deciso dall'AI, e le voci da scartare. `sig` dice su quali
 * risposte è stata fatta: se cambiano, la scelta va rifatta.
 */
export interface WordRank {
  at: string;
  sig: string;
  /** chiavi dalla più rappresentativa */
  order: string[];
  /** chiavi scartate */
  discard: string[];
  /** chi ha deciso: nome del profilo AI, oppure "manuale" */
  by: string;
}

/** Firma delle risposte aggregate: cambia se arrivano risposte o si uniscono parole. */
export function wordsSignature(words: WordStat[]): string {
  const s = words
    .map((w) => `${w.key}:${w.count}`)
    .sort()
    .join("|");
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `${words.length}-${(h >>> 0).toString(36)}`;
}

/**
 * Senza AI: quanto una voce è "imparentata" con le altre risposte (radici comuni,
 * es. "zero trust" e "trust", "autenticazione" e "autenticazioni forti").
 */
export function relatedness(words: WordStat[]): Map<string, number> {
  const roots = (key: string) => key.split(" ").filter((t) => t.length >= 4).map((t) => t.slice(0, 5));
  const byWord = words.map((w) => ({ key: w.key, count: w.count, roots: new Set(roots(w.key)) }));
  const out = new Map<string, number>();
  for (const a of byWord) {
    let score = 0;
    for (const b of byWord) {
      if (a.key === b.key) continue;
      for (const r of a.roots) {
        if (b.roots.has(r)) {
          score += b.count;
          break;
        }
      }
    }
    out.set(a.key, score);
  }
  return out;
}

/**
 * Ordine finale: prima il numero di persone (sempre decisivo), poi a parità la
 * rappresentatività scelta dall'AI, poi le parentele con altre risposte, poi
 * l'alfabeto. Le voci scartate vanno in fondo.
 */
export function rankWords(words: WordStat[], rank?: WordRank | null): WordStat[] {
  const discard = new Set(rank?.discard ?? []);
  const pos = new Map((rank?.order ?? []).map((k, i) => [k, i]));
  const rel = relatedness(words);
  return words
    .map((w) => (discard.has(w.key) ? { ...w, discarded: true } : w))
    .sort(
      (a, b) =>
        Number(!!a.discarded) - Number(!!b.discarded) ||
        b.count - a.count ||
        (pos.get(a.key) ?? 1e6) - (pos.get(b.key) ?? 1e6) ||
        (rel.get(b.key) ?? 0) - (rel.get(a.key) ?? 0) ||
        a.label.localeCompare(b.label, "it"),
    );
}

/**
 * Conta le parole per persona: chi scrive "utente" e "utenti" nella stessa risposta conta una volta.
 */
export function aggregate(answerWords: string[][], aliases: AliasMap = new Map()): WordStat[] {
  const stats = new Map<
    string,
    { count: number; forms: Map<string, number>; label?: string; merged: boolean }
  >();

  for (const words of answerWords) {
    const seen = new Set<string>();
    for (const raw of words) {
      const text = cleanWord(raw);
      if (!text) continue;
      let key = wordKey(text);
      if (!key) continue;
      let forcedLabel: string | undefined;
      const alias = aliases.get(key);
      if (alias) {
        forcedLabel = alias;
        key = wordKey(alias) || key;
      }
      let s = stats.get(key);
      if (!s) {
        s = { count: 0, forms: new Map(), merged: false };
        stats.set(key, s);
      }
      if (forcedLabel) {
        s.label = forcedLabel;
        s.merged = true;
      }
      s.forms.set(text, (s.forms.get(text) ?? 0) + 1);
      if (!seen.has(key)) {
        s.count += 1;
        seen.add(key);
      }
    }
  }

  const out: WordStat[] = [];
  for (const [key, s] of stats) {
    const forms = [...s.forms.entries()]
      .map(([text, count]) => ({ text, count }))
      .sort((a, b) => b.count - a.count || formQuality(b.text) - formQuality(a.text) || a.text.localeCompare(b.text, "it"));
    // con forme distinte (più parole diverse unite) l'etichetta resta quella scelta
    out.push({ key, label: s.label ?? forms[0].text, count: s.count, forms, merged: s.merged || forms.length > 1 });
  }
  return out.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "it"));
}

/** A parità di conteggio preferisce la forma con gli accenti, poi quella con più maiuscole (sigle: MFA). */
function formQuality(text: string): number {
  const accents = (text.normalize("NFD").match(/[̀-ͯ]/g) ?? []).length;
  const upper = (text.match(/[A-ZÀ-Ý]/g) ?? []).length;
  return accents * 100 + upper;
}

export function topN(stats: WordStat[], n = 3): WordStat[] {
  return stats.slice(0, n);
}

/** Valida e ripulisce l'invio di un partecipante. */
export function sanitizeSubmission(words: unknown, maxWords: number): string[] {
  if (!Array.isArray(words)) return [];
  const out: string[] = [];
  const keys = new Set<string>();
  for (const w of words) {
    if (typeof w !== "string") continue;
    const text = cleanWord(w);
    const key = wordKey(text);
    if (!text || !key || keys.has(key)) continue;
    keys.add(key);
    out.push(text);
    if (out.length >= maxWords) break;
  }
  return out;
}
