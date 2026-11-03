import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { ThemesList } from "@/components/Finale";
import { ResultView } from "@/components/ResultView";
import { getDb, schema } from "@/db";
import { eventSummary } from "@/lib/events";
import { publicResults } from "@/lib/reveal";
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
  const results = await publicResults(ev.id, ev.aiSummary);

  return (
    <main className="container stack">
      <div>
        <div className="small muted">Risultati</div>
        <h1>{ev.title}</h1>
        {!ev.resultsPublished && <div className="alert warn">Anteprima per gli operatori: i risultati non sono ancora pubblici.</div>}
      </div>

      <section className="card stack" style={{ maxWidth: 820 }}>
        <h2 style={{ margin: 0 }}>Argomento per argomento</h2>
        <div className="mstrips">
          {results.strips.map((st) => (
            <div key={st.blockId} className="mstrip">
              <div className="mstrip-title">{st.title}</div>
              <div className="mstrip-words">
                {st.words.length ? (
                  st.words.map((w, i) => (
                    <span key={w.label} className={`r${i + 1}`}>
                      {w.label}
                    </span>
                  ))
                ) : (
                  <span className="r2">{st.headline || "—"}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card stack" style={{ maxWidth: 820 }}>
        <h2 style={{ margin: 0 }}>{results.crown.themes.length ? "Dove convergono" : "Le parole più forti"}</h2>
        <ThemesList data={results.crown} />
      </section>

      <details>
        <summary>Tutti i dettagli per domanda</summary>
        <div style={{ marginTop: 16 }}>
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
        </div>
      </details>
      {summary.length === 0 && <p className="muted">Nessuna domanda è stata segnata per il riepilogo.</p>}
    </main>
  );
}
