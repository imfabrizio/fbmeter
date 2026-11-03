import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { getDb, schema } from "@/db";
import { eventSummary } from "@/lib/events";
import { currentUser, isOperator } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Risultati" };

/** Pagina finale: le 3 parole dominanti del sondaggio "dopo" per ogni blocco, con il confronto col "prima". */
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

  return (
    <main className="container stack">
      <div>
        <div className="small muted">Risultati</div>
        <h1>{ev.title}</h1>
        {!ev.resultsPublished && <div className="alert warn">Anteprima per gli operatori: i risultati non sono ancora pubblici.</div>}
        <p className="muted">
          Per ogni argomento, le tre parole più scritte <b>dopo</b> l&apos;intervento, confrontate con quelle di inizio blocco.
          Le parole evidenziate sono entrate nel podio solo dopo la spiegazione.
        </p>
      </div>

      <section className="card">
        <h2>In sintesi</h2>
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
            {summary.map((b) => (
              <tr key={b.id}>
                <td>
                  <b>{b.title}</b>
                </td>
                {[0, 1, 2].map((i) => (
                  <td key={i}>{b.post.top[i]?.label ?? <span className="muted">—</span>}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="grid">
        {summary.map((b) => (
          <section key={b.id} className="card result-card stack">
            <h2>
              <span className="block-num">{b.position + 1}</span>
              {b.title}
            </h2>
            <div>
              <div className="small muted">Dopo · {b.post.respondents} risposte</div>
              {b.post.top.length ? (
                <ol className="rank">
                  {b.post.top.map((w) => (
                    <li key={w.key}>
                      <b>
                        {w.label}
                        {b.newInPost.includes(w.label) && <span className="badge accent" style={{ marginLeft: 6 }}>nuova</span>}
                      </b>
                      <span className="muted">{w.count}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="muted">Nessuna risposta.</p>
              )}
            </div>
            <div>
              <div className="small muted">Prima · {b.pre.respondents} risposte</div>
              <div className="podium" style={{ marginTop: 6 }}>
                {b.pre.top.length ? (
                  b.pre.top.map((w) => (
                    <span key={w.key} className="pill muted-pill">
                      {w.label} <small>{w.count}</small>
                    </span>
                  ))
                ) : (
                  <span className="muted small">—</span>
                )}
              </div>
            </div>
            {b.post.all.length > 3 && (
              <details>
                <summary className="small">Tutte le parole del “dopo” ({b.post.all.length})</summary>
                <p className="small" style={{ marginTop: 8 }}>
                  {b.post.all.map((w) => `${w.label} (${w.count})`).join(" · ")}
                </p>
              </details>
            )}
          </section>
        ))}
      </div>
    </main>
  );
}
