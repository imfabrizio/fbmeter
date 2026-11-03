import { redirect } from "next/navigation";
import { devLoginEnabled, providerList, signIn } from "@/auth";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  OAuthAccountNotLinked: "Questa email è già collegata a un altro metodo di accesso.",
  AccessDenied: "Accesso negato.",
  Configuration: "Configurazione dell'accesso non valida: controlla le variabili d'ambiente.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; callbackUrl?: string }> }) {
  const { error, callbackUrl } = await searchParams;
  if (await currentUser()) redirect("/admin");
  const target = callbackUrl?.startsWith("/") ? callbackUrl : "/admin";
  const oauth = providerList.filter((p) => p.id !== "dev");

  return (
    <main className="narrow stack">
      <div className="center" style={{ paddingTop: 32 }}>
        <div className="brand" style={{ fontSize: "1.6rem" }}>
          FB<b>Meter</b>
        </div>
        <p className="muted">Accesso operatori</p>
      </div>
      <div className="card stack">
        {error && <div className="alert error">{ERRORS[error] ?? "Accesso non riuscito."}</div>}
        {oauth.length === 0 && !devLoginEnabled && (
          <div className="alert warn">
            Nessun metodo di accesso configurato. Imposta le variabili per Microsoft Entra ID e/o Google (vedi README).
          </div>
        )}
        {oauth.map((p) => (
          <form
            key={p.id}
            action={async () => {
              "use server";
              await signIn(p.id, { redirectTo: target });
            }}
          >
            <button className="btn block">
              {p.id === "microsoft-entra-id" ? "Accedi con Microsoft" : p.id === "google" ? "Accedi con Google" : `Accedi con ${p.name}`}
            </button>
          </form>
        ))}
        {devLoginEnabled && (
          <form
            className="stack"
            action={async (fd: FormData) => {
              "use server";
              await signIn("dev", { email: String(fd.get("email") ?? ""), redirectTo: target });
            }}
          >
            <div className="alert warn small">
              Accesso di sviluppo attivo (AUTH_DEV_LOGIN_INSECURE=1): chiunque può entrare con un&apos;email. Mai in produzione.
            </div>
            <input type="email" name="email" placeholder="email@esempio.it" required />
            <button className="btn">Entra (sviluppo)</button>
          </form>
        )}
      </div>
      <p className="center small muted">
        Il primo accesso crea l&apos;utenza: un amministratore deve abilitarla prima di poter usare la regia.
      </p>
      <p className="center tiny muted">
        <a href="/privacy">Privacy</a> · <a href="/termini">Termini</a>
      </p>
    </main>
  );
}
