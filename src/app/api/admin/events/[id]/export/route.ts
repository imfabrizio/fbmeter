import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { blocksWithQuestions, eventById, eventSummary, locateQuestion, questionLabel } from "@/lib/events";
import { QTYPES } from "@/lib/questions";
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

const typeLabel = (t: string) => QTYPES.find((q) => q.id === t)?.label ?? t;

/**
 * Esportazione CSV.
 * ?type=raw (default): una riga per risposta (per le parole: una riga per parola).
 * ?type=summary: risultati aggregati di tutte le domande, con unioni applicate.
 */
export const GET = api(async (req: Request, { params }: Ctx) => {
  await requireOperator();
  const { id } = await params;
  const ev = await eventById(id);
  const type = new URL(req.url).searchParams.get("type") ?? "raw";
  let rows: unknown[][];

  if (type === "summary") {
    const summary = await eventSummary(ev.id, { all: true });
    rows = [["blocco", "pos_blocco", "domanda", "tipo", "nel_riepilogo", "risposte", "rango", "voce", "conteggio", "percentuale", "dettaglio"]];
    const blocks = await blocksWithQuestions(ev.id);
    for (const b of summary) {
      for (const it of b.items) {
        const q = blocks.flatMap((x) => x.questions).find((x) => x.id === it.questionId)!;
        const base = [b.title, b.position + 1, it.label, typeLabel(it.result.type), q.inSummary ? "sì" : "no", it.result.respondents];
        const pct = (n: number) => (it.result.respondents ? `${Math.round((n / it.result.respondents) * 100)}%` : "");
        const r = it.result;
        if (r.type === "words") {
          r.words.forEach((w, i) =>
            rows.push([...base, i + 1, w.label, w.count, pct(w.count), w.forms.map((f) => `${f.text} (${f.count})`).join(", ")]),
          );
        } else if (r.type === "choice" || r.type === "quiz") {
          [...r.options]
            .sort((a, c) => c.count - a.count)
            .forEach((o, i) => rows.push([...base, i + 1, o.label, o.count, pct(o.count), o.correct ? "corretta" : ""]));
        } else if (r.type === "scale") {
          rows.push([...base, "", "media", r.average === null ? "" : r.average.toFixed(2).replace(".", ","), "", `${r.min}-${r.max}`]);
          r.distribution.forEach((d) => rows.push([...base, "", String(d.value), d.count, pct(d.count), ""]));
        } else if (r.type === "open") {
          r.items.forEach((t, i) => rows.push([...base, i + 1, t.text, "", "", t.nickname]));
        }
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
        choices: schema.answers.choices,
        scale: schema.answers.scale,
        textValue: schema.answers.textValue,
        updatedAt: schema.answers.updatedAt,
        nickname: schema.participants.nickname,
        participantId: schema.participants.id,
      })
      .from(schema.answers)
      .innerJoin(schema.participants, eq(schema.participants.id, schema.answers.participantId))
      .where(eq(schema.participants.eventId, ev.id))
      .orderBy(asc(schema.answers.updatedAt));
    rows = [["blocco", "pos_blocco", "domanda", "tipo", "partecipante_id", "nickname", "risposta", "chiave_normalizzata", "voce_finale", "orario"]];
    for (const a of answers) {
      const loc = locateQuestion(blocks, a.questionId);
      if (!loc) continue;
      const { block: b, question: q } = loc;
      const base = [b.title, b.position + 1, questionLabel(q, b), typeLabel(q.type), a.participantId, a.nickname];
      const time = a.updatedAt.toISOString();
      if (q.type === "words") {
        const map = new Map(aliasRows.filter((r) => r.blockId === b.id).map((r) => [r.sourceKey, r.targetLabel]));
        for (const raw of a.words) {
          const text = cleanWord(raw);
          const key = wordKey(text);
          rows.push([...base, text, key, map.get(key) ?? text, time]);
        }
      } else if (q.type === "choice" || q.type === "quiz") {
        for (const c of a.choices) rows.push([...base, q.options[c] ?? c, "", "", time]);
      } else if (q.type === "scale") {
        rows.push([...base, a.scale, "", "", time]);
      } else {
        rows.push([...base, a.textValue, "", "", time]);
      }
    }
  }

  const name = `${ev.code}-${type === "summary" ? "riepilogo" : "risposte"}.csv`;
  return new Response(toCsv(rows), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}"` },
  });
});
