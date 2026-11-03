import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { eventById } from "@/lib/events";
import { HttpError, api, readJson, requireOperator } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Azzera le prove prima dell'evento: elimina partecipanti (con le loro risposte e domande)
 * e, se richiesto, anche le unioni. I blocchi e le impostazioni restano.
 */
export const POST = api(async (req: Request, { params }: Ctx) => {
  await requireOperator();
  const { id } = await params;
  const ev = await eventById(id);
  const body = await readJson<{ confirm?: string; aliases?: boolean }>(req);
  if (body.confirm !== ev.code) throw new HttpError(400, "Conferma non valida: scrivi il codice dell'evento");

  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.delete(schema.qaQuestions).where(eq(schema.qaQuestions.eventId, ev.id));
    await tx.delete(schema.participants).where(eq(schema.participants.eventId, ev.id));
    if (body.aliases) {
      const blocks = await tx.select({ id: schema.blocks.id }).from(schema.blocks).where(eq(schema.blocks.eventId, ev.id));
      for (const b of blocks) await tx.delete(schema.aliases).where(eq(schema.aliases.blockId, b.id));
    }
    await tx.update(schema.blocks).set({ reveal: null }).where(eq(schema.blocks.eventId, ev.id));
    await tx
      .update(schema.events)
      .set({ activeQuestionId: null, screenMode: "live", screenBlockId: null, teaserBlockId: null, resultsPublished: false, aiSummary: null })
      .where(eq(schema.events.id, ev.id));
  });
  return NextResponse.json({ ok: true });
});
