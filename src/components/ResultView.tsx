"use client";

import { WordCloud, type CloudWord } from "./WordCloud";

/** Forma (compatta) dei risultati che arriva dalle API. */
export type ResultData =
  | { type: "words"; respondents: number; words: CloudWord[] }
  | {
      type: "choice" | "quiz";
      respondents: number;
      options: { label: string; count: number; correct: boolean }[];
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

const pct = (n: number, tot: number) => (tot ? Math.round((n / tot) * 100) : 0);

function Bars({
  rows,
  total,
  showCorrect,
}: {
  rows: { label: string; count: number; correct?: boolean }[];
  total: number;
  showCorrect?: boolean;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="bars">
      {rows.map((r, i) => (
        <div key={i} className={`bar-row ${showCorrect && r.correct ? "correct" : ""} ${showCorrect && !r.correct ? "dim" : ""}`}>
          <div className="bar-label">
            <span>
              {showCorrect && r.correct && "✓ "}
              {r.label}
            </span>
            <span className="bar-num">
              {pct(r.count, total)}% <small>({r.count})</small>
            </span>
          </div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${(r.count / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Visualizza il risultato di una domanda, qualunque sia il tipo. */
export function ResultView({
  result,
  revealed = true,
  cloudMax = 60,
  empty = "Ancora nessuna risposta",
}: {
  result: ResultData;
  revealed?: boolean;
  cloudMax?: number;
  empty?: string;
}) {
  if (!result.respondents) return <p className="muted center">{empty}</p>;
  switch (result.type) {
    case "words":
      return <WordCloud words={result.words} max={cloudMax} />;
    case "choice":
    case "quiz":
      return (
        <div style={{ width: "100%" }}>
          <Bars rows={result.options} total={result.respondents} showCorrect={result.type === "quiz" && revealed} />
          {result.type === "quiz" && revealed && result.correctRate !== null && (
            <p className="center" style={{ marginTop: "0.8em" }}>
              Ha risposto correttamente il <b>{Math.round(result.correctRate * 100)}%</b>
            </p>
          )}
        </div>
      );
    case "scale":
      return (
        <div className="scale-result" style={{ width: "100%" }}>
          <div className="scale-avg">
            <b>{result.average === null ? "–" : result.average.toFixed(1).replace(".", ",")}</b>
            <span>
              media su {result.max}
              {result.minLabel || result.maxLabel ? ` · ${result.min} = ${result.minLabel || "min"}, ${result.max} = ${result.maxLabel || "max"}` : ""}
            </span>
          </div>
          <Bars rows={result.distribution.map((d) => ({ label: String(d.value), count: d.count }))} total={result.respondents} />
        </div>
      );
    case "open":
      return (
        <ul className="open-list">
          {result.items.map((it, i) => (
            <li key={i}>{it.text}</li>
          ))}
        </ul>
      );
  }
}

/** Una riga sintetica, per elenchi e riepiloghi. */
export function ResultHeadline({ result }: { result: ResultData }) {
  if (!result.respondents) return <span className="muted">nessuna risposta</span>;
  switch (result.type) {
    case "words":
      return <>{result.words.slice(0, 3).map((w) => w.label).join(", ")}</>;
    case "choice":
    case "quiz": {
      const top = [...result.options].sort((a, b) => b.count - a.count)[0];
      return (
        <>
          {top.label} <span className="muted">({pct(top.count, result.respondents)}%)</span>
        </>
      );
    }
    case "scale":
      return <>media {result.average?.toFixed(1).replace(".", ",")} su {result.max}</>;
    case "open":
      return <>{result.items.length} risposte</>;
  }
}
