import { and, count, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { envAdminEmails, isRole } from "@/lib/roles";
import { HttpError, api, readJson, requireAdmin } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

async function target(id: string) {
  const [u] = await getDb().select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
  if (!u) throw new HttpError(404, "Utente non trovato");
  return u;
}

/** Vero se, tolto questo utente, resta almeno un altro amministratore. */
async function otherAdmins(id: string) {
  const [r] = await getDb()
    .select({ n: count() })
    .from(schema.users)
    .where(and(eq(schema.users.role, "admin"), ne(schema.users.id, id)));
  return Number(r?.n ?? 0) > 0;
}

export const PATCH = api(async (req: Request, { params }: Ctx) => {
  const me = await requireAdmin();
  const { id } = await params;
  const body = await readJson<{ role?: string }>(req);
  if (!isRole(body.role)) throw new HttpError(400, "Ruolo non valido");
  const u = await target(id);
  if (body.role !== "admin") {
    if (id === me.id) throw new HttpError(400, "Non puoi togliere a te stesso il ruolo di amministratore");
    if (envAdminEmails().includes(u.email))
      throw new HttpError(400, "Questo indirizzo è in ADMIN_EMAILS: resta amministratore finché non lo togli dalla variabile");
    if (u.role === "admin" && !(await otherAdmins(id))) throw new HttpError(400, "Deve restare almeno un amministratore");
  }
  await getDb().update(schema.users).set({ role: body.role }).where(eq(schema.users.id, id));
  return NextResponse.json({ ok: true });
});

export const DELETE = api(async (_req: Request, { params }: Ctx) => {
  const me = await requireAdmin();
  const { id } = await params;
  if (id === me.id) throw new HttpError(400, "Non puoi eliminare te stesso");
  const u = await target(id);
  if (u.role === "admin" && !(await otherAdmins(id))) throw new HttpError(400, "Deve restare almeno un amministratore");
  await getDb().delete(schema.users).where(eq(schema.users.id, id));
  return NextResponse.json({ ok: true });
});
