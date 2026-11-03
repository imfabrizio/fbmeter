import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { eventById } from "@/lib/events";
import { ConvergenceError, prepareConvergence } from "@/lib/reveal";
import { HttpError, api, requireOperator } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

export const maxDuration = 60;

/** Prepara (o rigenera) la convergenza finale: 9 parole → 3 macro-temi con l'AI dell'operatore. */
export const POST = api(async (_req: Request, { params }: Ctx) => {
  const me = await requireOperator();
  const { id } = await params;
  const ev = await eventById(id);
  try {
    return NextResponse.json(await prepareConvergence(ev.id, me.id));
  } catch (err) {
    if (err instanceof ConvergenceError) throw new HttpError(400, err.message);
    throw err;
  }
});

export const DELETE = api(async (_req: Request, { params }: Ctx) => {
  await requireOperator();
  const { id } = await params;
  const ev = await eventById(id);
  await getDb().update(schema.events).set({ aiSummary: null }).where(eq(schema.events.id, ev.id));
  return NextResponse.json({ ok: true });
});
