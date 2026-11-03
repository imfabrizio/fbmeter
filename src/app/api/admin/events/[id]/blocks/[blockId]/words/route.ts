import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { blocksWithQuestions, eventById, questionStats } from "@/lib/events";
import { HttpError, api, requireOperator } from "@/lib/session";

type Ctx = { params: Promise<{ id: string; blockId: string }> };

export const dynamic = "force-dynamic";

/** Tutte le voci di un blocco (inizio + fine) con le unioni attive, per la revisione. */
export const GET = api(async (_req: Request, { params }: Ctx) => {
  await requireOperator();
  const { id, blockId } = await params;
  const ev = await eventById(id);
  const block = (await blocksWithQuestions(ev.id)).find((b) => b.id === blockId);
  if (!block) throw new HttpError(404, "Blocco non trovato");

  const stats = await questionStats([block.pre.id, block.post.id]);
  const pre = stats.get(block.pre.id)!;
  const post = stats.get(block.post.id)!;

  const rows = new Map<string, { key: string; label: string; pre: number; post: number; forms: string[] }>();
  for (const [phase, s] of [["pre", pre], ["post", post]] as const) {
    for (const w of s.words) {
      const r = rows.get(w.key) ?? { key: w.key, label: w.label, pre: 0, post: 0, forms: [] };
      r[phase] = w.count;
      r.forms = [...new Set([...r.forms, ...w.forms.map((f) => f.text)])];
      rows.set(w.key, r);
    }
  }

  const aliases = await getDb()
    .select()
    .from(schema.aliases)
    .where(and(eq(schema.aliases.blockId, block.id)));

  return NextResponse.json({
    block: { id: block.id, title: block.title },
    respondents: { pre: pre.respondents, post: post.respondents },
    words: [...rows.values()].sort((a, b) => b.post + b.pre - (a.post + a.pre) || a.label.localeCompare(b.label, "it")),
    aliases: aliases.map((a) => ({ sourceKey: a.sourceKey, targetLabel: a.targetLabel })),
  });
});
