import { redirect } from "next/navigation";

/** Home: inserimento del codice evento (per chi non usa il QR) e accesso operatori. */
export default async function Home({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  const clean = (code ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase();
  if (clean) redirect(`/e/${clean}`);

  return (
    <main className="narrow stack">
      <div className="center" style={{ paddingTop: 32 }}>
        <div className="brand" style={{ fontSize: "1.8rem" }}>
          FB<b>Meter</b>
        </div>
        <p className="muted">Sondaggi a parole e domande dal pubblico</p>
      </div>
      <form className="card stack" action="/" method="get">
        <label className="field">
          <span>Codice evento</span>
          <input
            type="text"
            name="code"
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={12}
            placeholder="Es. K7M2QX"
            style={{ fontSize: "1.3rem", letterSpacing: "0.1em", textTransform: "uppercase" }}
          />
        </label>
        <button className="btn primary block">Partecipa</button>
      </form>
      <p className="center small">
        <a href="/admin">Accesso operatori</a>
      </p>
    </main>
  );
}
