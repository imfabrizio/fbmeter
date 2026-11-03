import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { eventCode } from "@/lib/crypto";
import { defaultQuestion, prePostTemplate } from "@/lib/questions";
import { HttpError, api, readJson, requireOperator } from "@/lib/session";

/**
 * Crea un evento con i suoi blocchi (una riga = un blocco).
 * template: "prepost" → ogni blocco con parole Inizio + Fine (Fine nel riepilogo);
 *           "words"   → una domanda a parole per blocco (nel riepilogo);
 *           "empty"   → blocchi vuoti, le domande si aggiungono dopo.
 */
export const POST = api(async (req: Request) => {
  const me = await requireOperator();
  const body = await readJson<{ title?: unknown; blocks?: unknown; template?: unknown }>(req);
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 120) : "";
  if (!title) throw new HttpError(400, "Serve un titolo");
  const template = body.template === "empty" || body.template === "words" ? body.template : "prepost";
  const blockTitles = (Array.isArray(body.blocks) ? body.blocks : [])
    .filter((b): b is string => typeof b === "string")
    .map((b) => b.trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, 30);

  const db = getDb();
  const ev = await db.transaction(async (tx) => {
    let created: typeof schema.events.$inferSelect | undefined;
    for (let attempt = 0; attempt < 5 && !created; attempt++) {
      [created] = await tx
        .insert(schema.events)
        .values({ title, code: eventCode(), ownerId: me.id })
        .onConflictDoNothing({ target: schema.events.code })
        .returning();
    }
    if (!created) throw new HttpError(500, "Impossibile generare un codice evento");
    for (const [i, t] of blockTitles.entries()) {
      const [b] = await tx.insert(schema.blocks).values({ eventId: created.id, position: i, title: t }).returning();
      const qs =
        template === "prepost"
          ? prePostTemplate(t)
          : template === "words"
            ? [{ ...defaultQuestion("words", t), inSummary: true }]
            : [];
      if (qs.length) {
        await tx
          .insert(schema.questions)
          .values(qs.map((q, position) => ({ ...q, eventId: created.id, blockId: b.id, position })));
      }
    }
    return created;
  });
  return NextResponse.json({ id: ev.id, code: ev.code });
});
