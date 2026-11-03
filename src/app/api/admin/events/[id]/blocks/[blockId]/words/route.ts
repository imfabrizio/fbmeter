import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { blocksWithQuestions, eventById, questionLabel, questionResults } from "@/lib/events";
import { HttpError, api, requireOperator } from "@/lib/session";

type Ctx = { params: Promise<{ id: string; blockId: string }> };

export const dynamic = "force-dynamic";

/** Tutte le voci delle domande a parole di un blocco, con le unioni attive, per la revisione. */
export const GET = api(async (_req: Request, { params }: Ctx) => {
  await requireOperator();
  const { id, blockId } = await params;
  const ev = await eventById(id);
  const block = (await blocksWithQuestions(ev.id)).find((b) => b.id === blockId);
  if (!block) throw new HttpError(404, "Blocco non trovato");

  const wordQs = block.questions.filter((q) => q.type === "words");
  const results = await questionResults(wordQs);
  const columns = wordQs.map((q) => ({ id: q.id, label: questionLabel(q, block), respondents: results.get(q.id)!.respondents }));

  const rows = new Map<string, { key: string; label: string; counts: Record<string, number>; forms: string[] }>();
  for (const q of wordQs) {
    const r = results.get(q.id)!;
    if (r.type !== "words") continue;
    for (const w of r.words) {
      const row = rows.get(w.key) ?? { key: w.key, label: w.label, counts: {}, forms: [] };
      row.counts[q.id] = w.count;
      row.forms = [...new Set([...row.forms, ...w.forms.map((f) => f.text)])];
      rows.set(w.key, row);
    }
  }
  const total = (r: { counts: Record<string, number> }) => Object.values(r.counts).reduce((s, n) => s + n, 0);

  const aliases = await getDb().select().from(schema.aliases).where(eq(schema.aliases.blockId, block.id));

  return NextResponse.json({
    block: { id: block.id, title: block.title },
    columns,
    words: [...rows.values()].sort((a, b) => total(b) - total(a) || a.label.localeCompare(b.label, "it")),
    aliases: aliases.map((a) => ({ sourceKey: a.sourceKey, targetLabel: a.targetLabel })),
  });
});
