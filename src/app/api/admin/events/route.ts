import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { eventCode } from "@/lib/crypto";
import { defaultPrompt } from "@/lib/events";
import { HttpError, api, readJson, requireOperator } from "@/lib/session";

/** Crea un evento con i suoi blocchi (una riga = un blocco). */
export const POST = api(async (req: Request) => {
  const me = await requireOperator();
  const body = await readJson<{ title?: unknown; blocks?: unknown }>(req);
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 120) : "";
  if (!title) throw new HttpError(400, "Serve un titolo");
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
      await tx.insert(schema.questions).values([
        { eventId: created.id, blockId: b.id, phase: "pre", prompt: defaultPrompt(t, "pre") },
        { eventId: created.id, blockId: b.id, phase: "post", prompt: defaultPrompt(t, "post") },
      ]);
    }
    return created;
  });
  return NextResponse.json({ id: ev.id, code: ev.code });
});
