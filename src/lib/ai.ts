/**
 * Suggerimenti di raggruppamento con l'AI dell'operatore.
 * Chiamate HTTP dirette (nessun SDK): cambiare fornitore = aggiungere un case.
 */

export type AiProvider = "anthropic" | "google" | "openai";

export interface ProviderInfo {
  id: AiProvider;
  label: string;
  short: string;
  defaultModel: string;
  /** Modelli suggeriti nel menu: si può comunque scriverne un altro. */
  models: { id: string; note: string }[];
  keyUrl: string;
  keyPrefix: string;
}

export const AI_PROVIDERS: ProviderInfo[] = [
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    short: "Claude",
    defaultModel: "claude-haiku-5-5",
    models: [
      { id: "claude-haiku-5-5", note: "veloce ed economico, consigliato" },
      { id: "claude-sonnet-5-5", note: "più accurato" },
      { id: "claude-opus-5-5", note: "il più capace, più lento e costoso" },
    ],
    keyUrl: "https://platform.claude.com/settings/keys",
    keyPrefix: "sk-ant-",
  },
  {
    id: "google",
    label: "Google (Gemini)",
    short: "Gemini",
    defaultModel: "gemini-3.5-flash-lite",
    models: [
      { id: "gemini-3.5-flash-lite", note: "veloce ed economico" },
      { id: "gemini-3.5-flash", note: "più accurato" },
    ],
    keyUrl: "https://aistudio.google.com/apikey",
    keyPrefix: "AIza",
  },
  {
    id: "openai",
    label: "OpenAI",
    short: "OpenAI",
    defaultModel: "gpt-4.1-mini",
    models: [{ id: "gpt-4.1-mini", note: "veloce ed economico" }],
    keyUrl: "https://platform.openai.com/api-keys",
    keyPrefix: "sk-",
  },
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
/* Rivelazione prima/dopo e convergenza finale                         */
/* ------------------------------------------------------------------ */

export interface EvolutionLink {
  from: string;
  to: string;
}

/**
 * Collegamenti "evolutivi" tra le parole del prima e del dopo di un blocco
 * (es. "utenza" → "identità"). Solo parole presenti negli elenchi.
 */
export async function generateLinks(
  provider: AiProvider,
  model: string,
  apiKey: string,
  topic: string,
  before: { label: string; count: number }[],
  after: { label: string; count: number }[],
): Promise<{ links: EvolutionLink[]; note: string }> {
  if (!before.length || !after.length) return { links: [], note: "" };
  const fmt = (l: { label: string; count: number }[]) => l.map((w) => `- ${w.label} (${w.count})`).join("\n");
  const prompt = `Durante un evento tecnico il pubblico ha scritto parole su "${topic}" prima e dopo la spiegazione dei relatori.

PRIMA della spiegazione:
${fmt(before)}

DOPO la spiegazione:
${fmt(after)}

Individua al massimo 3 "evoluzioni": coppie in cui un concetto del PRIMA si è trasformato o precisato in un concetto del DOPO (es. "password" → "MFA", "utenti" → "identità"). Il collegamento deve essere plausibile per un esperto del tema. Non collegare parole identiche. Se non ci sono evoluzioni sensate, restituisci un elenco vuoto.
Scrivi anche una frase breve in italiano (max 18 parole, tono positivo, rivolta al pubblico) che racconti il cambiamento.

Rispondi SOLO con JSON valido:
{"links":[{"from":"parola esatta del PRIMA","to":"parola esatta del DOPO"}],"note":"..."}`;
  const text = await callModel(provider, model, apiKey, prompt);
  const parsed = extractJson(text) as { links?: unknown; note?: unknown };
  const b = new Set(before.map((w) => w.label));
  const a = new Set(after.map((w) => w.label));
  const links = (Array.isArray(parsed.links) ? parsed.links : [])
    .map((l) => ({ from: String(l?.from ?? ""), to: String(l?.to ?? "") }))
    .filter((l) => b.has(l.from) && a.has(l.to) && l.from.toLowerCase() !== l.to.toLowerCase())
    .slice(0, 3);
  return { links, note: typeof parsed.note === "string" ? parsed.note.trim().slice(0, 200) : "" };
}

export interface Theme {
  label: string;
  words: string[];
}

/**
 * Le 9 parole della corona convergono in 3 macro-temi: ogni parola va in un solo tema.
 */
export async function generateThemes(
  provider: AiProvider,
  model: string,
  apiKey: string,
  eventTitle: string,
  words: { label: string; blocks: string[] }[],
): Promise<{ themes: Theme[]; note: string }> {
  const list = words.map((w) => `- ${w.label} (da: ${w.blocks.join(", ")})`).join("\n");
  const prompt = `Evento tecnico "${eventTitle}". Queste sono le ${words.length} parole più forti scritte dal pubblico alla fine dei vari argomenti:
${list}

Raggruppale in esattamente 3 macro-temi trasversali che mostrino dove convergono i diversi argomenti (es. "identità" e "MFA" convergono in "Sicurezza dell'identità").
Regole:
- ogni parola va assegnata a UN solo tema, e tutte le parole devono essere assegnate;
- l'etichetta di ogni tema è breve (2-4 parole), in italiano, d'impatto, leggibile su un proiettore;
- copia le parole esattamente come nell'elenco.
Scrivi anche una frase finale (max 22 parole) che leghi i tre temi, rivolta al pubblico.

Rispondi SOLO con JSON valido:
{"themes":[{"label":"...","words":["...","..."]}],"note":"..."}`;
  const text = await callModel(provider, model, apiKey, prompt);
  const parsed = extractJson(text) as { themes?: unknown; note?: unknown };
  const valid = new Map(words.map((w) => [w.label.toLowerCase(), w.label]));
  const used = new Set<string>();
  const themes: Theme[] = (Array.isArray(parsed.themes) ? parsed.themes : []).slice(0, 3).map((t) => ({
    label: typeof t?.label === "string" ? t.label.trim().slice(0, 40) : "",
    words: (Array.isArray(t?.words) ? t.words : [])
      .map((w: unknown) => valid.get(String(w).toLowerCase()))
      .filter((w: string | undefined): w is string => !!w && !used.has(w) && (used.add(w), true)),
  }));
  while (themes.length < 3) themes.push({ label: "", words: [] });
  themes.forEach((t, i) => {
    if (!t.label) t.label = `Tema ${i + 1}`;
  });
  // parole dimenticate dall'AI: vanno nel tema più piccolo
  for (const w of words) {
    if (used.has(w.label)) continue;
    themes.sort((x, y) => x.words.length - y.words.length)[0].words.push(w.label);
    used.add(w.label);
  }
  return { themes: themes.filter((t) => t.words.length), note: typeof parsed.note === "string" ? parsed.note.trim().slice(0, 220) : "" };
}
