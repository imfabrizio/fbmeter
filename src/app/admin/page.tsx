import { desc, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { getDb, schema } from "@/db";
import { CreateEventForm } from "./CreateEventForm";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const db = getDb();
  const events = await db
    .select({
      id: schema.events.id,
      code: schema.events.code,
      title: schema.events.title,
      createdAt: schema.events.createdAt,
      activeQuestionId: schema.events.activeQuestionId,
      owner: schema.users.email,
      blocks: sql<number>`(select count(*)::int from ${schema.blocks} b where b.event_id = ${schema.events.id})`,
      participants: sql<number>`(select count(*)::int from ${schema.participants} p where p.event_id = ${schema.events.id})`,
    })
    .from(schema.events)
    .leftJoin(schema.users, eq(schema.users.id, schema.events.ownerId))
    .orderBy(desc(schema.events.createdAt));

  return (
    <main className="container stack">
      <div className="spread">
        <h1>Eventi</h1>
      </div>
      <div className="grid">
        {events.map((e) => (
          <Link key={e.id} href={`/admin/events/${e.id}`} className="card" style={{ textDecoration: "none", color: "inherit" }}>
            <div className="spread">
              <span className="badge accent">{e.code}</span>
              {e.activeQuestionId && <span className="badge live">domanda aperta</span>}
            </div>
            <h2 style={{ marginTop: 10 }}>{e.title}</h2>
            <div className="small muted">
              {e.blocks} blocchi · {e.participants} partecipanti
            </div>
            <div className="tiny muted">
              {e.createdAt.toLocaleDateString("it-IT")} {e.owner ? `· ${e.owner}` : ""}
            </div>
          </Link>
        ))}
        {events.length === 0 && <p className="muted">Nessun evento ancora: creane uno qui sotto.</p>}
      </div>
      <CreateEventForm />
    </main>
  );
}
