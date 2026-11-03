import { asc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { currentUser } from "@/lib/session";
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
  const users = await getDb().select().from(schema.users).orderBy(asc(schema.users.role), asc(schema.users.email));

  return (
    <main className="container stack">
      <h1>Utenti</h1>
      <p className="muted small">
        Chiunque acceda con Microsoft o Google compare qui come <b>in attesa</b>. Abilitalo come operatore per dargli la
        regia, o come amministratore per gestire anche gli utenti. Gli indirizzi in <code>ADMIN_EMAILS</code> sono sempre
        amministratori; i domini in <code>OPERATOR_EMAIL_DOMAINS</code> vengono abilitati in automatico.
      </p>
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
              />
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
