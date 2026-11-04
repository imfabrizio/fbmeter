import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { EMAIL_RE, isRole } from "@/lib/roles";
import { HttpError, api, readJson, requireAdmin } from "@/lib/session";

/**
 * Invita un utente per email con il ruolo già assegnato.
 * Al primo accesso (Microsoft o Google con la stessa email) trova il ruolo pronto.
 */
export const POST = api(async (req: Request) => {
  await requireAdmin();
  const body = await readJson<{ email?: string; role?: string }>(req);
  const email = (body.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new HttpError(400, "Email non valida");
  const role = body.role ?? "operator";
  if (!isRole(role) || role === "pending") throw new HttpError(400, "Ruolo non valido");
  const db = getDb();
  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (existing) {
    await db.update(schema.users).set({ role }).where(eq(schema.users.id, existing.id));
    return NextResponse.json({ ok: true, updated: true });
  }
  await db.insert(schema.users).values({ email, role });
  return NextResponse.json({ ok: true, created: true });
});
