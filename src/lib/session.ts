import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDb, schema } from "@/db";

export type Operator = typeof schema.users.$inferSelect;

/** Utente collegato (anche pending), o null. */
export async function currentUser(): Promise<Operator | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const [u] = await getDb().select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
  return u ?? null;
}

export function isOperator(u: Operator | null): boolean {
  return !!u && (u.role === "operator" || u.role === "admin");
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function requireOperator(): Promise<Operator> {
  const u = await currentUser();
  if (!u) throw new HttpError(401, "Accesso richiesto");
  if (!isOperator(u)) throw new HttpError(403, "Utente in attesa di approvazione");
  return u;
}

export async function requireAdmin(): Promise<Operator> {
  const u = await requireOperator();
  if (u.role !== "admin") throw new HttpError(403, "Serve il ruolo di amministratore");
  return u;
}

/** Avvolge un handler API: converte HttpError e errori imprevisti in JSON. */
export function api<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status });
      console.error(err);
      return NextResponse.json({ error: "Errore interno" }, { status: 500 });
    }
  };
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "JSON non valido");
  }
}
