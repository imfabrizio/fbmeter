import { asc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { currentUser } from "@/lib/session";
import { envAdminEmails } from "@/lib/roles";
import { InviteForm } from "./InviteForm";
import { UserRow } from "./UserRow";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const me = await currentUser();
  if (me?.role !== "admin") {
    return (
      <main className="container">
        <div className="alert error">Serve il ruolo di amministratore.</div>
      </main>
    );
  }
  const envAdmins = envAdminEmails();
  const users = await getDb().select().from(schema.users).orderBy(asc(schema.users.role), asc(schema.users.email));

  return (
    <main className="container stack">
      <h1>Utenti</h1>
      <p className="muted small">
        Chi accede con Microsoft o Google compare qui come <b>in attesa</b>. Abilitalo come <b>operatore</b> per dargli la
        regia, o come <b>amministratore</b> per fargli gestire anche utenti e ruoli. Puoi anche invitare qualcuno prima che
        acceda: al primo login con la stessa email troverà il ruolo già assegnato.
      </p>
      <InviteForm />
      <div className="card" style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Accesso</th>
              <th>Ultimo login</th>
              <th>Ruolo</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <UserRow
                key={u.id}
                user={{
                  id: u.id,
                  email: u.email,
                  name: u.name,
                  provider: u.provider,
                  role: u.role,
                  lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
                }}
                isMe={u.id === me.id}
                fromEnv={envAdmins.includes(u.email)}
              />
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted tiny">
        <code>ADMIN_EMAILS</code> serve solo per il primo amministratore: dopo puoi nominarne altri da qui e, se vuoi,
        svuotare la variabile. <code>OPERATOR_EMAIL_DOMAINS</code> abilita in automatico come operatori i domini indicati.
      </p>
    </main>
  );
}
