import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import { currentUser, isOperator } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await currentUser();
  if (!me) redirect("/login");

  const logout = (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/login" });
      }}
    >
      <button className="btn sm ghost">Esci</button>
    </form>
  );

  if (!isOperator(me)) {
    return (
      <main className="narrow stack center">
        <h1>Utenza in attesa</h1>
        <p className="muted">
          Hai effettuato l&apos;accesso come <b>{me.email}</b>, ma un amministratore deve ancora abilitarti come operatore.
        </p>
        <div className="row" style={{ justifyContent: "center" }}>
          {logout}
        </div>
      </main>
    );
  }

  return (
    <>
      <header className="topbar">
        <div className="inner">
          <Link href="/admin" className="brand">
            FB<b>Meter</b>
          </Link>
          <nav>
            <Link href="/admin">Eventi</Link>
            <Link href="/admin/settings">Impostazioni AI</Link>
            {me.role === "admin" && <Link href="/admin/users">Utenti</Link>}
          </nav>
          <span className="small muted">{me.email}</span>
          {logout}
        </div>
      </header>
      {children}
    </>
  );
}
