import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { randomToken, sha256 } from "@/lib/crypto";
import { demoAnswer, demoNickname, type DemoQuestion } from "@/lib/demo";
import { blocksWithQuestions, eventById } from "@/lib/events";
import { HttpError, api, readJson, requireOperator } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Genera partecipanti di prova che rispondono a tutte le domande dell'evento.
 * Si eliminano con "Azzera le prove".
 */
export const POST = api(async (req: Request, { params }: Ctx) => {
  await requireOperator();
  const { id } = await params;
  const ev = await eventById(id);
  const body = await readJson<{ participants?: number }>(req);
  const n = Math.min(80, Math.max(1, Math.round(Number(body.participants) || 25)));

  const blocks = await blocksWithQuestions(ev.id);
  const questions: DemoQuestion[] = blocks.flatMap((b) => {
    let w = 0;
    return b.questions.map((q) => ({ ...q, blockTitle: b.title, wordsIndex: q.type === "words" ? w++ : -1 }));
  });
  if (!questions.length) throw new HttpError(400, "L'evento non ha ancora domande");

  const db = getDb();
  const seed = Date.now() % 100000;
  await db.transaction(async (tx) => {
    const created = await tx
      .insert(schema.participants)
      .values(Array.from({ length: n }, (_, i) => ({ eventId: ev.id, nickname: demoNickname(i), tokenHash: sha256(randomToken()) })))
      .returning({ id: schema.participants.id });
    const rows = created.flatMap((p, i) =>
      questions
        // non tutti rispondono a tutto: circa il 90% per domanda
        .filter((q) => (i * 31 + q.id.charCodeAt(2) + seed) % 10 !== 0)
        .map((q) => ({ questionId: q.id, participantId: p.id, ...demoAnswer(q, i, seed) })),
    );
    for (let i = 0; i < rows.length; i += 500) await tx.insert(schema.answers).values(rows.slice(i, i + 500));
  });

  return NextResponse.json({ ok: true, participants: n, questions: questions.length });
});
