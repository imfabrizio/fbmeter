import { and, count, eq, gt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { eventByCode, requireParticipant } from "@/lib/events";
import { HttpError, api, readJson } from "@/lib/session";

type Ctx = { params: Promise<{ code: string }> };

export const POST = api(async (req: Request, { params }: Ctx) => {
  const { code } = await params;
  const ev = await eventByCode(code);
  if (!ev.qaEnabled || ev.resultsPublished) throw new HttpError(403, "Le domande non sono attive per questo evento");
  const me = await requireParticipant(req, ev.id);
  const body = await readJson<{ text?: unknown }>(req);
  const text = typeof body.text === "string" ? body.text.replace(/\s+/g, " ").trim().slice(0, 300) : "";
  if (text.length < 5) throw new HttpError(400, "Domanda troppo corta");

  const db = getDb();
  // freno anti-spam: massimo 3 domande ogni 2 minuti a persona
  const [recent] = await db
    .select({ n: count() })
    .from(schema.qaQuestions)
    .where(
      and(
        eq(schema.qaQuestions.participantId, me.id),
        gt(schema.qaQuestions.createdAt, new Date(Date.now() - 120_000)),
      ),
    );
  if ((recent?.n ?? 0) >= 3) throw new HttpError(429, "Hai inviato molte domande: riprova tra poco");

  await db.insert(schema.qaQuestions).values({
    eventId: ev.id,
    participantId: me.id,
    text,
    status: ev.qaModerated ? "pending" : "visible",
  });
  return NextResponse.json({ ok: true, moderated: ev.qaModerated });
});
