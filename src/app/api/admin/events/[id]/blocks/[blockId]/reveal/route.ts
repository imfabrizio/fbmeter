import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { eventById } from "@/lib/events";
import { prepareReveal } from "@/lib/reveal";
import { HttpError, api, readJson, requireOperator } from "@/lib/session";

type Ctx = { params: Promise<{ id: string; blockId: string }> };

export const maxDuration = 60;

/**
 * Rivela sul proiettore il prima/dopo di un blocco.
 * Body: { show?: boolean (default true), refresh?: boolean }.
 * Se la rivelazione non è pronta (o refresh), la prepara adesso.
 */
export const POST = api(async (req: Request, { params }: Ctx) => {
  const me = await requireOperator();
  const { id, blockId } = await params;
  const ev = await eventById(id);
  const body = await readJson<{ show?: boolean; refresh?: boolean }>(req);
  const db = getDb();
  const [block] = await db
    .select()
    .from(schema.blocks)
    .where(and(eq(schema.blocks.id, blockId), eq(schema.blocks.eventId, ev.id)))
    .limit(1);
  if (!block) throw new HttpError(404, "Blocco non trovato");

  let reveal = block.reveal;
  if (!reveal || body.refresh) {
    reveal = await prepareReveal(ev.id, block.id, me.id);
    if (!reveal) throw new HttpError(400, "Per il prima/dopo servono almeno due domande a parole nel blocco");
  }
  if (body.show !== false) {
    await db
      .update(schema.events)
      .set({ screenMode: "reveal", screenBlockId: block.id, teaserBlockId: block.id, activeQuestionId: null })
      .where(eq(schema.events.id, ev.id));
  }
  return NextResponse.json({ ok: true, reveal });
});
