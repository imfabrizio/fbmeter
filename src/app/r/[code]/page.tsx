import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { PublicResults } from "@/components/PublicResults";
import { getDb, schema } from "@/db";
import { publicResults } from "@/lib/reveal";
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

  const results = await publicResults(ev.id, ev.aiSummary);

  return (
    <>
      {!ev.resultsPublished && (
        <div className="alert warn" style={{ borderRadius: 0, textAlign: "center" }}>
          Anteprima per gli operatori: i risultati non sono ancora pubblici.
        </div>
      )}
      <PublicResults title={ev.title} results={results} code={ev.code} />
    </>
  );
}
