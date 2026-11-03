import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { InsightsView, type AiSummaryData } from "@/components/InsightsView";
import { ResultView } from "@/components/ResultView";
import { getDb, schema } from "@/db";
import { eventSummary, overallTopWords } from "@/lib/events";
import { slimResult } from "@/lib/questions";
import { currentUser, isOperator } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Risultati" };

/** Pagina finale: per ogni blocco, le domande che la regia ha segnato "nel riepilogo". */
export default async function ResultsPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const [ev] = await getDb()
    .select()
    .from(schema.events)
    .where(eq(schema.events.code, code.toUpperCase()))
    .limit(1);
  if (!ev) {
    return (
      <main className="narrow center">
        <h1>Evento non trovato</h1>
      </main>
    );
  }
  const operator = isOperator(await currentUser());
  if (!ev.resultsPublished && !operator) {
    return (
      <main className="narrow center">
        <h1>{ev.title}</h1>
        <p className="muted">I risultati non sono ancora stati pubblicati.</p>
      </main>
    );
  }

  const summary = await eventSummary(ev.id);
  const top = await overallTopWords(ev.id);
  const ai = (ev.aiSummary ?? null) as AiSummaryData | null;
  const wordRows = summary.flatMap((b) =>
    b.items.filter((it) => it.result.type === "words").map((it) => ({ block: b, item: it })),
  );

  return (
    <main className="container stack">
      <div>
        <div className="small muted">Risultati</div>
        <h1>{ev.title}</h1>
        {!ev.resultsPublished && <div className="alert warn">Anteprima per gli operatori: i risultati non sono ancora pubblici.</div>}
      </div>

      {(ai || top.length > 0) && (
        <section className="card">
          <InsightsView ai={ai} top={top} />
        </section>
      )}

      {wordRows.length > 0 && (
        <section className="card" style={{ overflowX: "auto" }}>
          <h2>In sintesi: le parole più scritte</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Argomento</th>
                <th>1ª</th>
                <th>2ª</th>
                <th>3ª</th>
              </tr>
            </thead>
            <tbody>
              {wordRows.map(({ block, item }) => (
                <tr key={item.questionId}>
                  <td>
                    <b>{block.title}</b>
                    {block.items.length > 1 && <div className="tiny muted">{item.label}</div>}
                  </td>
                  {[0, 1, 2].map((i) => (
                    <td key={i}>{item.result.type === "words" && item.result.words[i] ? item.result.words[i].label : <span className="muted">—</span>}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <div className="grid">
        {summary.map((b) => (
          <section key={b.id} className="card result-card stack">
            <h2>
              <span className="block-num">{b.position + 1}</span>
              {b.title}
            </h2>
            {b.items.map((it) => (
              <div key={it.questionId} className="stack" style={{ gap: 8 }}>
                <div>
                  <div className="small muted">
                    {it.label} · {it.result.respondents} risposte
                  </div>
                  <div className="small">{it.prompt}</div>
                </div>
                {it.result.type === "words" ? (
                  <>
                    {it.result.words.length ? (
                      <ol className="rank">
                        {it.result.words.slice(0, 3).map((w) => (
                          <li key={w.key}>
                            <b>
                              {w.label}
                              {it.newWords?.includes(w.label) && (
                                <span className="badge accent" style={{ marginLeft: 6 }}>
                                  nuova
                                </span>
                              )}
                            </b>
                            <span className="muted">{w.count}</span>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="muted">Nessuna risposta.</p>
                    )}
                    {it.before && (
                      <div>
                        <div className="small muted">
                          {it.before.label} · {it.before.respondents} risposte
                        </div>
                        <div className="podium" style={{ marginTop: 6 }}>
                          {it.before.top.length ? (
                            it.before.top.map((w) => (
                              <span key={w.key} className="pill muted-pill">
                                {w.label} <small>{w.count}</small>
                              </span>
                            ))
                          ) : (
                            <span className="muted small">—</span>
                          )}
                        </div>
                      </div>
                    )}
                    {it.result.words.length > 3 && (
                      <details>
                        <summary className="small">Tutte le parole ({it.result.words.length})</summary>
                        <p className="small" style={{ marginTop: 8 }}>
                          {it.result.words.map((w) => `${w.label} (${w.count})`).join(" · ")}
                        </p>
                      </details>
                    )}
                  </>
                ) : (
                  <ResultView result={slimResult(it.result)} />
                )}
              </div>
            ))}
          </section>
        ))}
      </div>
      {summary.length === 0 && <p className="muted">Nessuna domanda è stata segnata per il riepilogo.</p>}
      {wordRows.some((r) => r.item.newWords?.length) && (
        <p className="small muted">“Nuova” indica una parola entrata nel podio solo rispetto alla domanda a parole precedente dello stesso blocco.</p>
      )}
    </main>
  );
}
