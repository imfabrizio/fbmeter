import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { randomToken, sha256 } from "@/lib/crypto";
import { eventByCode } from "@/lib/events";
import { HttpError, api, readJson } from "@/lib/session";

type Ctx = { params: Promise<{ code: string }> };

/** Ingresso del pubblico: nickname → token salvato sul telefono. */
export const POST = api(async (req: Request, { params }: Ctx) => {
  const { code } = await params;
  const ev = await eventByCode(code);
  const body = await readJson<{ nickname?: unknown }>(req);
  const nickname = typeof body.nickname === "string" ? body.nickname.replace(/\s+/g, " ").trim().slice(0, 30) : "";
  if (nickname.length < 2) throw new HttpError(400, "Scegli un nickname di almeno 2 caratteri");

  const token = randomToken();
  await getDb().insert(schema.participants).values({ eventId: ev.id, nickname, tokenHash: sha256(token) });
  return NextResponse.json({ token, nickname });
});
