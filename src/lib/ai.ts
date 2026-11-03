/**
 * Suggerimenti di raggruppamento con l'AI dell'operatore.
 * Chiamate HTTP dirette (nessun SDK): cambiare fornitore = aggiungere un case.
 */

export type AiProvider = "anthropic" | "google" | "openai";

export const AI_PROVIDERS: { id: AiProvider; label: string; defaultModel: string }[] = [
  { id: "anthropic", label: "Anthropic (Claude)", defaultModel: "claude-haiku-5-5" },
  { id: "google", label: "Google (Gemini)", defaultModel: "gemini-3.5-flash-lite" },
  { id: "openai", label: "OpenAI", defaultModel: "gpt-4.1-mini" },
];

export interface AiGroup {
  label: string;
  members: string[];
}

function buildPrompt(topic: string, words: { label: string; count: number }[]): string {
  const list = words.map((w) => `- ${w.label} (${w.count})`).join("\n");
  return `Durante una presentazione tecnica sull'argomento "${topic}" il pubblico ha scritto parole libere.
Ecco le voci già normalizzate, con il numero di persone che le hanno scritte:
${list}

Raggruppa SOLO le voci che esprimono chiaramente lo stesso concetto nel contesto di "${topic}":
sinonimi, traduzioni italiano/inglese, sigle e loro forma estesa, refusi evidenti.
Non unire concetti solo vicini o correlati (es. "sicurezza" e "firewall" restano separati).
Per ogni gruppo scegli come etichetta la forma più chiara per un pubblico italiano.
Ignora le voci che non vanno unite a nulla.

Rispondi SOLO con JSON valido, senza testo prima o dopo, in questo formato:
{"groups":[{"label":"etichetta scelta","members":["voce 1","voce 2"]}]}
I valori in "members" devono essere copiati esattamente dall'elenco.`;
}

function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("La risposta dell'AI non contiene JSON");
  return JSON.parse(text.slice(start, end + 1));
}

async function callModel(provider: AiProvider, model: string, apiKey: string, prompt: string): Promise<string> {
  const signal = AbortSignal.timeout(45_000);
  let res: Response;
  switch (provider) {
    case "anthropic":
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal,
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({ model, max_tokens: 4000, messages: [{ role: "user", content: prompt }] }),
      });
      break;
    case "google":
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          signal,
          headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" },
          }),
        },
      );
      break;
    case "openai":
      res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        signal,
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          response_format: { type: "json_object" },
          messages: [{ role: "user", content: prompt }],
        }),
      });
      break;
    default:
      throw new Error("Fornitore AI non supportato");
  }

  const body = await res.text();
  if (!res.ok) throw new Error(`Errore dal fornitore AI (${res.status}): ${body.slice(0, 300)}`);
  const json = JSON.parse(body);
  if (provider === "anthropic") {
    return (json.content ?? []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("");
  }
  if (provider === "google") {
    return (json.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
  }
  return json.choices?.[0]?.message?.content ?? "";
}

export async function suggestGroups(
  provider: AiProvider,
  model: string,
  apiKey: string,
  topic: string,
  words: { label: string; count: number }[],
): Promise<AiGroup[]> {
  if (words.length < 2) return [];
  const text = await callModel(provider, model, apiKey, buildPrompt(topic, words.slice(0, 300)));
  const parsed = extractJson(text) as { groups?: unknown };
  const valid = new Set(words.map((w) => w.label));
  const groups: AiGroup[] = [];
  for (const g of Array.isArray(parsed.groups) ? parsed.groups : []) {
    const label = typeof g?.label === "string" ? g.label.trim().slice(0, 40) : "";
    const members = Array.isArray(g?.members)
      ? [...new Set<string>(g.members.filter((m: unknown) => typeof m === "string" && valid.has(m)))]
      : [];
    if (label && members.length >= 2) groups.push({ label, members });
  }
  return groups;
}

/** Test minimo della chiave salvata. */
export async function testKey(provider: AiProvider, model: string, apiKey: string): Promise<void> {
  await callModel(provider, model, apiKey, 'Rispondi solo con {"ok":true}');
}

/* ------------------------------------------------------------------ */
/* Sintesi dell'evento                                                 */
/* ------------------------------------------------------------------ */

export interface SummaryInput {
  eventTitle: string;
  sections: {
    title: string;
    /** domande a parole: etichetta, se è nel riepilogo, voci con conteggi */
    words: { label: string; inSummary: boolean; respondents: number; items: { label: string; count: number }[] }[];
    /** altre domande, già riassunte in una riga */
    other: { label: string; prompt: string; headline: string }[];
  }[];
}

export interface Keyword {
  label: string;
  count: number;
}

export interface AiSummary {
  generatedAt: string;
  provider: string;
  model: string;
  overall: Keyword[];
  overallNote: string;
  sections: { title: string; keywords: Keyword[]; note: string }[];
}

function buildSummaryPrompt(input: SummaryInput): string {
  const sections = input.sections
    .map((s, i) => {
      const words = s.words
        .map(
          (w) =>
            `  Domanda a parole "${w.label}"${w.inSummary ? " [PRINCIPALE]" : ""} (${w.respondents} risposte): ` +
            (w.items.length ? w.items.map((x) => `${x.label} (${x.count})`).join(", ") : "nessuna risposta"),
        )
        .join("\n");
      const other = s.other.map((o) => `  Domanda "${o.label}": ${o.prompt} → ${o.headline || "nessuna risposta"}`).join("\n");
      return `Sezione ${i + 1}: "${s.title}"\n${words || "  (nessuna domanda a parole)"}${other ? "\n" + other : ""}`;
    })
    .join("\n\n");

  return `Sei l'analista di un evento tecnico dal vivo intitolato "${input.eventTitle}".
Il pubblico ha risposto da telefono a domande divise per sezioni. Per le domande a parole hai le voci scritte con il numero di persone che le hanno scritte.
Le domande segnate [PRINCIPALE] sono quelle che l'organizzatore considera il risultato della sezione (di solito quelle di fine sezione, dopo la spiegazione): dai loro più peso; le altre servono come contesto (es. cosa pensava il pubblico prima).

${sections}

Compito:
1. Per ogni sezione indica da 3 a 5 parole chiave che riassumono cosa il pubblico associa a quella sezione, privilegiando le domande [PRINCIPALE]. Puoi unire sinonimi, traduzioni e varianti in un'unica parola chiave (es. "accesso condizionale" e "Conditional Access"); in quel caso "count" è la somma dei conteggi uniti. Usa solo concetti presenti nelle risposte, non inventarne.
2. Aggiungi per ogni sezione una frase breve (max 25 parole, in italiano) su cosa emerge, ad esempio come è cambiata la percezione rispetto alla domanda iniziale.
3. Indica le 5 parole chiave principali dell'intero evento, considerando tutte le sezioni, con il loro conteggio complessivo, e una frase di sintesi generale (max 35 parole).
Le sezioni senza risposte vanno restituite con keywords vuoto e note "".

Rispondi SOLO con JSON valido, senza testo prima o dopo, in questo formato:
{"sections":[{"title":"titolo esatto della sezione","keywords":[{"label":"...","count":0}],"note":"..."}],"overall":[{"label":"...","count":0}],"overallNote":"..."}`;
}

function cleanKeywords(v: unknown, max: number): Keyword[] {
  return (Array.isArray(v) ? v : [])
    .map((k) => ({
      label: typeof k?.label === "string" ? k.label.trim().slice(0, 40) : "",
      count: Math.max(0, Math.round(Number(k?.count) || 0)),
    }))
    .filter((k) => k.label)
    .sort((a, b) => b.count - a.count)
    .slice(0, max);
}

export async function generateSummary(provider: AiProvider, model: string, apiKey: string, input: SummaryInput): Promise<AiSummary> {
  const text = await callModel(provider, model, apiKey, buildSummaryPrompt(input));
  const parsed = extractJson(text) as { sections?: unknown; overall?: unknown; overallNote?: unknown };
  const got = Array.isArray(parsed.sections) ? parsed.sections : [];
  return {
    generatedAt: new Date().toISOString(),
    provider,
    model,
    overall: cleanKeywords(parsed.overall, 5),
    overallNote: typeof parsed.overallNote === "string" ? parsed.overallNote.trim().slice(0, 400) : "",
    // si allinea alle sezioni reali, nell'ordine dell'evento
    sections: input.sections.map((s, i) => {
      const m =
        got.find((g: { title?: unknown }) => typeof g?.title === "string" && g.title.trim().toLowerCase() === s.title.toLowerCase()) ??
        got[i];
      return {
        title: s.title,
        keywords: cleanKeywords(m?.keywords, 5),
        note: typeof m?.note === "string" ? m.note.trim().slice(0, 300) : "",
      };
    }),
  };
}
