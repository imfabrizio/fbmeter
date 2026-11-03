import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { generateSummary, type AiProvider, type SummaryInput } from "@/lib/ai";
import { decrypt } from "@/lib/crypto";
import { blocksWithQuestions, eventById, questionLabel, questionResults } from "@/lib/events";
import { headline } from "@/lib/questions";
import { HttpError, api, requireOperator } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

export const maxDuration = 60;

/** Genera (o rigenera) la sintesi AI dell'evento con la chiave dell'operatore collegato. */
export const POST = api(async (_req: Request, { params }: Ctx) => {
  const me = await requireOperator();
  const { id } = await params;
  const ev = await eventById(id);

  const [settings] = await getDb().select().from(schema.aiSettings).where(eq(schema.aiSettings.userId, me.id)).limit(1);
  if (!settings) throw new HttpError(400, "Configura prima la tua chiave AI in Impostazioni AI");
  let apiKey: string;
  try {
    apiKey = decrypt(settings.keyCiphertext);
  } catch {
    throw new HttpError(400, "Impossibile leggere la chiave salvata: inseriscila di nuovo");
  }

  const blocks = await blocksWithQuestions(ev.id);
  const results = await questionResults(blocks.flatMap((b) => b.questions));
  const input: SummaryInput = {
    eventTitle: ev.title,
    sections: blocks.map((b) => ({
      title: b.title,
      words: b.questions
        .filter((q) => q.type === "words")
        .map((q) => {
          const r = results.get(q.id)!;
          return {
            label: questionLabel(q, b),
            inSummary: q.inSummary,
            respondents: r.respondents,
            items: r.type === "words" ? r.words.slice(0, 40).map((w) => ({ label: w.label, count: w.count })) : [],
          };
        }),
      other: b.questions
        .filter((q) => q.type !== "words" && q.type !== "open")
        .map((q) => ({ label: questionLabel(q, b), prompt: q.prompt, headline: headline(results.get(q.id)!) })),
    })),
  };
  const totalAnswers = [...results.values()].reduce((s, r) => s + r.respondents, 0);
  if (!totalAnswers) throw new HttpError(400, "Non ci sono ancora risposte da sintetizzare");

  let summary;
  try {
    summary = await generateSummary(settings.provider as AiProvider, settings.model, apiKey, input);
  } catch (err) {
    throw new HttpError(502, err instanceof Error ? err.message : "Errore AI");
  }
  await getDb().update(schema.events).set({ aiSummary: summary }).where(eq(schema.events.id, ev.id));
  return NextResponse.json(summary);
});

/** Elimina la sintesi: pagina e proiettore tornano alle parole calcolate dai conteggi. */
export const DELETE = api(async (_req: Request, { params }: Ctx) => {
  await requireOperator();
  const { id } = await params;
  const ev = await eventById(id);
  await getDb().update(schema.events).set({ aiSummary: null }).where(eq(schema.events.id, ev.id));
  return NextResponse.json({ ok: true });
});
