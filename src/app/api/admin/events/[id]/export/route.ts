import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { blocksWithQuestions, eventById, eventSummary } from "@/lib/events";
import { api, requireOperator } from "@/lib/session";
import { cleanWord, wordKey } from "@/lib/words";

type Ctx = { params: Promise<{ id: string }> };

function csvCell(v: unknown): string {
  const s = String(v ?? "");
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: unknown[][]): string {
  // BOM + ";" : si apre correttamente in Excel con impostazioni italiane
  return "﻿" + rows.map((r) => r.map(csvCell).join(";")).join("\r\n");
}

/**
 * Esportazione CSV.
 * ?type=raw (default): una riga per parola scritta, con forma originale, chiave e voce finale.
 * ?type=summary: classifica per blocco e fase, con unioni applicate.
 */
export const GET = api(async (req: Request, { params }: Ctx) => {
  await requireOperator();
  const { id } = await params;
  const ev = await eventById(id);
  const type = new URL(req.url).searchParams.get("type") ?? "raw";
  let rows: unknown[][];

  if (type === "summary") {
    const summary = await eventSummary(ev.id);
    rows = [["blocco", "posizione", "fase", "rango", "voce", "persone", "forme_originali"]];
    for (const b of summary) {
      for (const [phase, data] of [["inizio", b.pre], ["fine", b.post]] as const) {
        data.all.forEach((w, i) =>
          rows.push([b.title, b.position + 1, phase, i + 1, w.label, w.count, w.forms.map((f) => `${f.text} (${f.count})`).join(", ")]),
        );
      }
    }
  } else {
    const db = getDb();
    const blocks = await blocksWithQuestions(ev.id);
    const aliasRows = await db.select().from(schema.aliases);
    const answers = await db
      .select({
        questionId: schema.answers.questionId,
        words: schema.answers.words,
        updatedAt: schema.answers.updatedAt,
        nickname: schema.participants.nickname,
        participantId: schema.participants.id,
      })
      .from(schema.answers)
      .innerJoin(schema.participants, eq(schema.participants.id, schema.answers.participantId))
      .where(eq(schema.participants.eventId, ev.id))
      .orderBy(asc(schema.answers.updatedAt));
    rows = [["blocco", "posizione", "fase", "partecipante_id", "nickname", "parola_scritta", "chiave_normalizzata", "voce_finale", "orario"]];
    for (const a of answers) {
      const b = blocks.find((x) => x.pre.id === a.questionId || x.post.id === a.questionId);
      if (!b) continue;
      const phase = b.pre.id === a.questionId ? "inizio" : "fine";
      const map = new Map(aliasRows.filter((r) => r.blockId === b.id).map((r) => [r.sourceKey, r.targetLabel]));
      for (const raw of a.words) {
        const text = cleanWord(raw);
        const key = wordKey(text);
        rows.push([b.title, b.position + 1, phase, a.participantId, a.nickname, text, key, map.get(key) ?? text, a.updatedAt.toISOString()]);
      }
    }
  }

  const name = `${ev.code}-${type === "summary" ? "classifica" : "risposte"}.csv`;
  return new Response(toCsv(rows), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}"` },
  });
});
