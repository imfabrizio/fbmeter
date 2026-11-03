export interface Keyword {
  label: string;
  count: number;
}

export interface AiSummaryData {
  generatedAt: string;
  provider: string;
  model: string;
  overall: Keyword[];
  overallNote: string;
  sections: { title: string; keywords: Keyword[]; note: string }[];
}

/**
 * Sintesi dell'evento: le 5 parole chiave principali e le parole chiave di ogni sezione.
 * Con la sintesi AI mostra quella; altrimenti le 5 parole più scritte calcolate dai conteggi.
 */
export function InsightsView({
  ai,
  top,
  variant = "page",
}: {
  ai: AiSummaryData | null;
  top: Keyword[];
  variant?: "page" | "screen";
}) {
  const overall = ai?.overall.length ? ai.overall : top;
  const sections = ai?.sections.filter((s) => s.keywords.length) ?? [];

  return (
    <div className={`insights insights-${variant}`}>
      <div className="insights-top">
        <div className="insights-kicker">{ai ? "Le 5 parole chiave dell'evento" : "Le 5 parole più scritte"}</div>
        {overall.length ? (
          <ol className="insights-podium">
            {overall.map((k, i) => (
              <li key={k.label} style={{ fontSize: `${(1.6 - i * 0.12).toFixed(2)}em` }}>
                <span className="insights-rank">{i + 1}</span>
                <b>{k.label}</b>
                {k.count > 0 && <small>{k.count}</small>}
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted">Ancora nessuna risposta.</p>
        )}
        {ai?.overallNote && <p className="insights-note">{ai.overallNote}</p>}
      </div>

      {sections.length > 0 && (
        <div className="insights-sections">
          {sections.map((s) => (
            <div key={s.title} className="insights-section">
              <h3>{s.title}</h3>
              <div className="podium">
                {s.keywords.map((k) => (
                  <span key={k.label} className="pill">
                    {k.label}
                    {k.count > 0 && <small>{k.count}</small>}
                  </span>
                ))}
              </div>
              {s.note && <p className="insights-section-note">{s.note}</p>}
            </div>
          ))}
        </div>
      )}
      {ai && variant === "page" && <p className="tiny muted">Sintesi generata con l&apos;intelligenza artificiale a partire dalle risposte del pubblico.</p>}
    </div>
  );
}
