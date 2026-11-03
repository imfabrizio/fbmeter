import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { eventById } from "@/lib/events";
import { HttpError, api, readJson, requireOperator } from "@/lib/session";

type Ctx = { params: Promise<{ id: string; qid: string }> };

const STATUSES = new Set(["pending", "visible", "answered", "hidden"]);

/** Moderazione: approva, segna come risposta, nascondi. */
export const PATCH = api(async (req: Request, { params }: Ctx) => {
  await requireOperator();
  const { id, qid } = await params;
  const ev = await eventById(id);
  const body = await readJson<{ status?: string }>(req);
  if (!body.status || !STATUSES.has(body.status)) throw new HttpError(400, "Stato non valido");
  await getDb()
    .update(schema.qaQuestions)
    .set({ status: body.status })
    .where(and(eq(schema.qaQuestions.id, qid), eq(schema.qaQuestions.eventId, ev.id)));
  return NextResponse.json({ ok: true });
});
