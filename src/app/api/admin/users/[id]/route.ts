import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { HttpError, api, readJson, requireAdmin } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

const ROLES = new Set(["pending", "operator", "admin"]);

export const PATCH = api(async (req: Request, { params }: Ctx) => {
  const me = await requireAdmin();
  const { id } = await params;
  const body = await readJson<{ role?: string }>(req);
  if (!body.role || !ROLES.has(body.role)) throw new HttpError(400, "Ruolo non valido");
  if (id === me.id && body.role !== "admin") throw new HttpError(400, "Non puoi togliere a te stesso il ruolo di amministratore");
  await getDb().update(schema.users).set({ role: body.role }).where(eq(schema.users.id, id));
  return NextResponse.json({ ok: true });
});

export const DELETE = api(async (_req: Request, { params }: Ctx) => {
  const me = await requireAdmin();
  const { id } = await params;
  if (id === me.id) throw new HttpError(400, "Non puoi eliminare te stesso");
  await getDb().delete(schema.users).where(eq(schema.users.id, id));
  return NextResponse.json({ ok: true });
});
