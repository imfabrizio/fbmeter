/**
 * Tipi di domanda: validazione delle risposte e calcolo dei risultati.
 * Aggiungere un tipo = aggiungerlo qui, nel form del telefono e nel grafico del proiettore.
 */
import { aggregate, sanitizeSubmission, type AliasMap, type WordStat } from "./words";

export type QType = "words" | "choice" | "scale" | "open" | "quiz";

export const QTYPES: { id: QType; label: string; hint: string }[] = [
  { id: "words", label: "Parole (nuvola)", hint: "Ognuno scrive fino a N parole; risultato a nuvola e podio" },
  { id: "choice", label: "Scelta multipla", hint: "Opzioni predefinite, una o più risposte; risultato a barre" },
  { id: "scale", label: "Scala", hint: "Un voto da min a max (es. 1–5); media e distribuzione" },
  { id: "open", label: "Risposta aperta", hint: "Una frase libera; elenco delle risposte" },
  { id: "quiz", label: "Quiz", hint: "Opzioni con risposta corretta da rivelare quando vuoi" },
];

export const isQType = (t: unknown): t is QType => QTYPES.some((q) => q.id === t);

export interface QuestionConfig {
  id: string;
  type: string;
  label: string;
  prompt: string;
  maxWords: number;
  options: string[];
  multiple: boolean;
  correct: number[];
  scaleMin: number;
  scaleMax: number;
  scaleMinLabel: string;
  scaleMaxLabel: string;
  inSummary: boolean;
  revealed: boolean;
}

export interface AnswerRow {
  words: string[];
  choices: number[];
  scale: number | null;
  textValue: string | null;
  nickname?: string;
  updatedAt?: Date;
}

/** Risposta così come la manda il telefono. */
export interface AnswerInput {
  words?: unknown;
  choices?: unknown;
  value?: unknown;
  text?: unknown;
}

export class AnswerError extends Error {}

/** Normalizza e valida una risposta per il tipo di domanda. */
export function sanitizeAnswer(q: QuestionConfig, input: AnswerInput) {
  const empty = { words: [] as string[], choices: [] as number[], scale: null as number | null, textValue: null as string | null };
  switch (q.type) {
    case "words": {
      const words = sanitizeSubmission(input.words, q.maxWords);
      if (!words.length) throw new AnswerError("Scrivi almeno una parola");
      return { ...empty, words };
    }
    case "choice":
    case "quiz": {
      const raw = Array.isArray(input.choices) ? input.choices : [];
      const choices = [...new Set(raw.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < q.options.length))].sort(
        (a, b) => a - b,
      );
      if (!choices.length) throw new AnswerError("Scegli una risposta");
      if (!q.multiple && choices.length > 1) throw new AnswerError("Puoi scegliere una sola risposta");
      return { ...empty, choices };
    }
    case "scale": {
      const v = Number(input.value);
      if (!Number.isInteger(v) || v < q.scaleMin || v > q.scaleMax) throw new AnswerError("Valore non valido");
      return { ...empty, scale: v };
    }
    case "open": {
      const t = typeof input.text === "string" ? input.text.replace(/\s+/g, " ").trim().slice(0, 300) : "";
      if (t.length < 2) throw new AnswerError("Scrivi una risposta");
      return { ...empty, textValue: t };
    }
    default:
      throw new AnswerError("Tipo di domanda non supportato");
  }
}

/** Risposta del partecipante da rimandare al suo telefono. */
export function myAnswerView(q: QuestionConfig, a: AnswerRow | undefined) {
  if (!a) return null;
  switch (q.type) {
    case "words":
      return { words: a.words };
    case "choice":
    case "quiz":
      return { choices: a.choices };
    case "scale":
      return { value: a.scale };
    case "open":
      return { text: a.textValue };
    default:
      return null;
  }
}

export type QuestionResult =
  | { type: "words"; respondents: number; words: WordStat[] }
  | {
      type: "choice" | "quiz";
      respondents: number;
      options: { label: string; count: number; correct: boolean }[];
      /** quiz: quota di chi ha risposto esattamente giusto (0–1) */
      correctRate: number | null;
    }
  | {
      type: "scale";
      respondents: number;
      average: number | null;
      distribution: { value: number; count: number }[];
      min: number;
      max: number;
      minLabel: string;
      maxLabel: string;
    }
  | { type: "open"; respondents: number; items: { text: string; nickname: string }[] };

export function computeResult(q: QuestionConfig, rows: AnswerRow[], aliases?: AliasMap): QuestionResult {
  const respondents = rows.length;
  switch (q.type) {
    case "choice":
    case "quiz": {
      const counts = q.options.map(() => 0);
      for (const r of rows) for (const c of r.choices) if (c < counts.length) counts[c]++;
      const correctSet = [...q.correct].sort((a, b) => a - b).join(",");
      const rightOnes = q.type === "quiz" && q.correct.length ? rows.filter((r) => r.choices.join(",") === correctSet).length : 0;
      return {
        type: q.type,
        respondents,
        options: q.options.map((label, i) => ({ label, count: counts[i], correct: q.type === "quiz" && q.correct.includes(i) })),
        correctRate: q.type === "quiz" && respondents ? rightOnes / respondents : null,
      };
    }
    case "scale": {
      const values = rows.map((r) => r.scale).filter((v): v is number => typeof v === "number");
      const distribution = [];
      for (let v = q.scaleMin; v <= q.scaleMax; v++) distribution.push({ value: v, count: values.filter((x) => x === v).length });
      return {
        type: "scale",
        respondents,
        average: values.length ? values.reduce((s, v) => s + v, 0) / values.length : null,
        distribution,
        min: q.scaleMin,
        max: q.scaleMax,
        minLabel: q.scaleMinLabel,
        maxLabel: q.scaleMaxLabel,
      };
    }
    case "open": {
      const items = [...rows]
        .filter((r) => r.textValue)
        .sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0))
        .map((r) => ({ text: r.textValue!, nickname: r.nickname ?? "" }));
      return { type: "open", respondents, items };
    }
    default:
      return { type: "words", respondents, words: aggregate(rows.map((r) => r.words), aliases) };
  }
}

/** Versione compatta per il proiettore e per le API pubbliche. */
export function slimResult(r: QuestionResult, maxWords = 60) {
  if (r.type === "words") return { ...r, words: r.words.slice(0, maxWords).map((w) => ({ label: w.label, count: w.count })) };
  if (r.type === "open") return { ...r, items: r.items.slice(0, 30).map((i) => ({ text: i.text, nickname: "" })) };
  return r;
}

/** Testo di una riga di riepilogo (export, schermata finale). */
export function headline(r: QuestionResult): string {
  switch (r.type) {
    case "words":
      return r.words.slice(0, 3).map((w) => w.label).join(", ");
    case "choice":
    case "quiz": {
      const top = [...r.options].sort((a, b) => b.count - a.count)[0];
      return top && r.respondents ? `${top.label} (${Math.round((top.count / r.respondents) * 100)}%)` : "";
    }
    case "scale":
      return r.average === null ? "" : `media ${r.average.toFixed(1)} su ${r.max}`;
    case "open":
      return `${r.items.length} risposte`;
  }
}

/** Valori predefiniti di una nuova domanda. */
export function defaultQuestion(type: QType, blockTitle: string, label = "") {
  const base = {
    type,
    label,
    maxWords: 3,
    options: [] as string[],
    multiple: false,
    correct: [] as number[],
    scaleMin: 1,
    scaleMax: 5,
    scaleMinLabel: "",
    scaleMaxLabel: "",
    inSummary: false,
  };
  switch (type) {
    case "words":
      return { ...base, prompt: `Quando senti "${blockTitle}", quali parole ti vengono in mente?` };
    case "choice":
      return { ...base, prompt: `Su "${blockTitle}", quale opzione ti rappresenta di più?`, options: ["Opzione A", "Opzione B", "Opzione C"] };
    case "quiz":
      return { ...base, prompt: "Qual è la risposta corretta?", options: ["Risposta A", "Risposta B", "Risposta C"], correct: [0] };
    case "scale":
      return { ...base, prompt: `Quanto ti è stato utile "${blockTitle}"?`, scaleMinLabel: "Poco", scaleMaxLabel: "Molto" };
    case "open":
      return { ...base, prompt: `Una domanda o un commento su "${blockTitle}"?` };
  }
}

/** Le due domande del modello classico "parole inizio + fine". */
export function prePostTemplate(blockTitle: string) {
  return [
    { ...defaultQuestion("words", blockTitle, "Inizio") },
    {
      ...defaultQuestion("words", blockTitle, "Fine"),
      prompt: `Ora che ne abbiamo parlato: quali parole associ a "${blockTitle}"?`,
      inSummary: true,
    },
  ];
}

/** Pulisce la configurazione di una domanda inviata dall'editor. */
export function sanitizeConfig(input: Record<string, unknown>, blockTitle: string) {
  const type: QType = isQType(input.type) ? input.type : "words";
  const d = defaultQuestion(type, blockTitle);
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
  const int = (v: unknown, lo: number, hi: number, def: number) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def;
  };
  const options = (Array.isArray(input.options) ? input.options : [])
    .map((o) => str(o, 120))
    .filter(Boolean)
    .slice(0, 12);
  let scaleMin = int(input.scaleMin, 0, 10, 1);
  let scaleMax = int(input.scaleMax, 1, 10, 5);
  if (scaleMax <= scaleMin) [scaleMin, scaleMax] = [Math.min(scaleMin, scaleMax), Math.max(scaleMin + 1, scaleMax)];
  const correct = (Array.isArray(input.correct) ? input.correct : [])
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 0 && n < options.length);
  if ((type === "choice" || type === "quiz") && options.length < 2) {
    throw new AnswerError(`"${str(input.prompt, 60) || "Domanda"}": servono almeno 2 opzioni`);
  }
  if (type === "quiz" && !correct.length) {
    throw new AnswerError(`"${str(input.prompt, 60) || "Quiz"}": indica almeno una risposta corretta`);
  }
  return {
    type,
    label: str(input.label, 30),
    prompt: str(input.prompt, 300) || d.prompt,
    maxWords: int(input.maxWords, 1, 10, 3),
    options: type === "choice" || type === "quiz" ? options : [],
    multiple: (type === "choice" || type === "quiz") && input.multiple === true,
    correct: type === "quiz" ? [...new Set(correct)] : [],
    scaleMin,
    scaleMax,
    scaleMinLabel: str(input.scaleMinLabel, 30),
    scaleMaxLabel: str(input.scaleMaxLabel, 30),
    inSummary: input.inSummary === true,
  };
}
