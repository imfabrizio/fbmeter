import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { eventById } from "@/lib/events";
import { HttpError, api, readJson, requireOperator } from "@/lib/session";
import { cleanWord, wordKey } from "@/lib/words";

type Ctx = { params: Promise<{ id: string; blockId: string }> };

async function checkBlock(eventId: string, blockId: string) {
  const [b] = await getDb()
    .select()
    .from(schema.blocks)
    .where(and(eq(schema.blocks.id, blockId), eq(schema.blocks.eventId, eventId)))
    .limit(1);
  if (!b) throw new HttpError(404, "Blocco non trovato");
  return b;
}

/**
 * Unisce più voci sotto un'etichetta. Body: { targetLabel, sourceKeys: string[] }.
 * Accetta anche più gruppi insieme: { groups: [{ targetLabel, sourceKeys }] } (suggerimenti AI).
 */
export const POST = api(async (req: Request, { params }: Ctx) => {
  await requireOperator();
  const { id, blockId } = await params;
  const ev = await eventById(id);
  const block = await checkBlock(ev.id, blockId);
  const body = await readJson<{
    targetLabel?: string;
    sourceKeys?: string[];
    groups?: { targetLabel?: string; sourceKeys?: string[] }[];
  }>(req);

  const groups = Array.isArray(body.groups) ? body.groups : [{ targetLabel: body.targetLabel, sourceKeys: body.sourceKeys }];
  const db = getDb();
  let created = 0;
  await db.transaction(async (tx) => {
    for (const g of groups.slice(0, 100)) {
      const label = cleanWord(typeof g.targetLabel === "string" ? g.targetLabel : "");
      const targetKey = wordKey(label);
      if (!label || !targetKey) throw new HttpError(400, "Etichetta non valida");
      const keys = new Set((Array.isArray(g.sourceKeys) ? g.sourceKeys : []).filter((k) => typeof k === "string" && k));
      keys.add(targetKey); // anche la forma canonica mostra l'etichetta scelta

      // chi puntava a una delle voci unite ora punta alla nuova etichetta (niente catene)
      const existing = await tx.select().from(schema.aliases).where(eq(schema.aliases.blockId, block.id));
      for (const a of existing) {
        if (keys.has(wordKey(a.targetLabel)) && !keys.has(a.sourceKey)) keys.add(a.sourceKey);
      }

      for (const sourceKey of keys) {
        await tx
          .insert(schema.aliases)
          .values({ blockId: block.id, sourceKey, targetLabel: label })
          .onConflictDoUpdate({
            target: [schema.aliases.blockId, schema.aliases.sourceKey],
            set: { targetLabel: label },
          });
        created++;
      }
    }
  });
  return NextResponse.json({ ok: true, created });
});

/** Scioglie un'unione: ?targetLabel=… rimuove tutto il gruppo, ?sourceKey=… una sola voce. */
export const DELETE = api(async (req: Request, { params }: Ctx) => {
  await requireOperator();
  const { id, blockId } = await params;
  const ev = await eventById(id);
  const block = await checkBlock(ev.id, blockId);
  const sp = new URL(req.url).searchParams;
  const target = sp.get("targetLabel");
  const source = sp.get("sourceKey");
  const db = getDb();
  if (target) {
    await db
      .delete(schema.aliases)
      .where(and(eq(schema.aliases.blockId, block.id), eq(schema.aliases.targetLabel, target)));
  } else if (source) {
    await db
      .delete(schema.aliases)
      .where(and(eq(schema.aliases.blockId, block.id), eq(schema.aliases.sourceKey, source)));
  } else throw new HttpError(400, "Specifica targetLabel o sourceKey");
  return NextResponse.json({ ok: true });
});
