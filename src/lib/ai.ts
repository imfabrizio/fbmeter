/**
 * Suggerimenti di raggruppamento con l'AI dell'operatore.
 * Chiamate HTTP dirette (nessun SDK): cambiare fornitore = aggiungere un case.
 */

export type AiProvider = "anthropic" | "google" | "openai" | "azure";

/** Tutto ciò che serve per chiamare un modello. `endpoint` solo per Azure OpenAI. */
export interface AiTarget {
  provider: AiProvider;
  model: string;
  key: string;
  endpoint?: string | null;
}

const AZURE_HOSTS = [".openai.azure.com", ".cognitiveservices.azure.com", ".services.ai.azure.com"];

/**
 * Normalizza l'endpoint di una risorsa Azure OpenAI / Microsoft Foundry: tiene solo
 * https://<risorsa>.<dominio Microsoft>. Rifiuta host non Microsoft (il server non
 * deve chiamare indirizzi arbitrari scelti dall'utente).
 */
export function normalizeAzureEndpoint(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw.trim().includes("://") ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    throw new Error("Endpoint non valido: copialo dalla pagina Keys and Endpoint della risorsa");
  }
  const host = u.hostname.toLowerCase();
  if (u.protocol !== "https:" || !AZURE_HOSTS.some((h) => host.endsWith(h) && host.length > h.length))
    throw new Error("L'endpoint deve essere del tipo https://<risorsa>.openai.azure.com (o .cognitiveservices.azure.com / .services.ai.azure.com)");
  return `https://${host}`;
}

export interface ProviderInfo {
  id: AiProvider;
  label: string;
  short: string;
  defaultModel: string;
  /** Modelli suggeriti nel menu: si può comunque scriverne un altro. Vuoto = campo libero. */
  models: { id: string; note: string }[];
  /** Etichetta del campo modello (per Azure è il nome del deployment). */
  modelLabel?: string;
  needsEndpoint?: boolean;
  keyUrl: string;
  keyPrefix: string;
  /** Mini guida mostrata nel modulo: passi in ordine, poi note. */
  howto: { steps: string[]; notes?: string[]; links: { label: string; url: string }[] };
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
    howto: {
      steps: [
        "Apri la Claude Console (platform.claude.com) e accedi, creando un'organizzazione se non ne hai una.",
        "Metti dei crediti: con un piano Max o Team collegali da claude.ai → Settings → Billing → API credits (possibile 7 giorni dopo l'attivazione del piano); altrimenti acquistali in Console → Billing.",
        "In Console → API keys premi Create key e dalle un nome (es. FBMeter).",
        "Copia subito la chiave (inizia con sk-ant-): non verrà più mostrata. Incollala qui sotto.",
      ],
      notes: [
        "L'API si paga a parte rispetto agli abbonamenti Claude: i crediti del piano Max scadono a fine ciclo e non coprono Claude Code.",
        "Per tenere sotto controllo la spesa crea in Console un workspace dedicato con un limite di spesa.",
      ],
      links: [
        { label: "Chiavi API", url: "https://platform.claude.com/settings/keys" },
        { label: "Crediti per piani Max/Team", url: "https://platform.claude.com/docs/en/about-claude/api-credits-for-subscribers" },
      ],
    },
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
    howto: {
      steps: [
        "Apri Google AI Studio (aistudio.google.com) con il tuo account Google.",
        "Vai su Get API key → Create API key. Puoi usare un progetto Google Cloud già esistente (anche quello del login di FBMeter).",
        "Copia la chiave (inizia con AIza) e incollala qui sotto.",
      ],
      notes: [
        "Senza fatturazione attiva il piano gratuito ha limiti di richieste al minuto: per un evento di solito bastano.",
        "Nel piano gratuito Google può usare i contenuti per migliorare i suoi servizi: se il partner è sensibile al tema, attiva la fatturazione sul progetto.",
        "Se un modello risponde 404 o «non disponibile per i nuovi utenti», scegline un altro dal menu.",
      ],
      links: [{ label: "Chiavi API di AI Studio", url: "https://aistudio.google.com/apikey" }],
    },
  },
  {
    id: "openai",
    label: "OpenAI",
    short: "OpenAI",
    defaultModel: "gpt-4.1-mini",
    models: [{ id: "gpt-4.1-mini", note: "veloce ed economico" }],
    keyUrl: "https://platform.openai.com/api-keys",
    keyPrefix: "sk-",
    howto: {
      steps: [
        "Apri platform.openai.com e accedi (l'API è separata dall'abbonamento ChatGPT).",
        "In Settings → Billing aggiungi del credito prepagato: senza credito le chiamate falliscono.",
        "In API keys premi Create new secret key, meglio dentro un progetto dedicato (es. FBMeter).",
        "Copia la chiave (inizia con sk-) e incollala qui sotto.",
      ],
      links: [{ label: "Chiavi API OpenAI", url: "https://platform.openai.com/api-keys" }],
    },
  },
  {
    id: "azure",
    label: "Azure OpenAI (Microsoft Foundry)",
    short: "Azure OpenAI",
    defaultModel: "",
    models: [],
    modelLabel: "Nome del deployment",
    needsEndpoint: true,
    keyUrl: "https://ai.azure.com",
    keyPrefix: "",
    howto: {
      steps: [
        "Nel portale Azure crea una risorsa Azure OpenAI (o una risorsa Microsoft Foundry) in una region europea dove il modello che vuoi è disponibile.",
        "In Microsoft Foundry (ai.azure.com) apri la risorsa → Deployments → Deploy model e scegli un modello veloce, es. gpt-4.1-mini. Come tipo di deployment, Data Zone Standard (EU) tiene l'elaborazione in UE.",
        "Annota il nome del deployment che hai dato: va nel campo «Nome del deployment» qui sotto (non il nome del modello, se diverso).",
        "Nella risorsa apri Keys and Endpoint (nel portale Azure, sezione Resource Management) e copia l'Endpoint e la KEY 1.",
        "Incolla qui sotto endpoint, nome del deployment e chiave, poi premi Salva: la prova parte da sola.",
      ],
      notes: [
        "FBMeter usa l'API v1 di Azure OpenAI: non serve indicare una api-version.",
        "Se la tua organizzazione disattiva le chiavi locali (disableLocalAuth), l'accesso con chiave non funziona: serve un'eccezione o una risorsa dedicata.",
        "Il consumo va sulla sottoscrizione Azure della risorsa.",
      ],
      links: [
        { label: "Microsoft Foundry", url: "https://ai.azure.com" },
        { label: "API v1 di Azure OpenAI", url: "https://learn.microsoft.com/azure/foundry/openai/api-version-lifecycle" },
      ],
    },
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

async function callModel(t: AiTarget, prompt: string): Promise<string> {
  const { provider, model, key: apiKey } = t;
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
    case "azure": {
      if (!t.endpoint) throw new Error("Manca l'endpoint della risorsa Azure OpenAI");
      // API v1 di Azure OpenAI: niente api-version, "model" = nome del deployment
      res = await fetch(`${normalizeAzureEndpoint(t.endpoint)}/openai/v1/chat/completions`, {
        method: "POST",
        signal,
        headers: { "content-type": "application/json", "api-key": apiKey },
        body: JSON.stringify({
          model,
          response_format: { type: "json_object" },
          messages: [{ role: "user", content: prompt }],
        }),
      });
      break;
    }
    default:
      throw new Error("Fornitore AI non supportato");
  }

  const body = await res.text();
  if (!res.ok) throw new Error(friendlyError(provider, res.status, body));
  const json = JSON.parse(body);
  if (provider === "anthropic") {
    return (json.content ?? []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("");
  }
  if (provider === "google") {
    return (json.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
  }
  return json.choices?.[0]?.message?.content ?? "";
}

/** Messaggi d'errore comprensibili per i casi più comuni, poi il dettaglio del fornitore. */
function friendlyError(provider: AiProvider, status: number, body: string): string {
  const b = body.toLowerCase();
  let hint = "";
  if (status === 401 || status === 403) hint = "chiave non valida o senza permessi";
  else if (b.includes("credit balance") || b.includes("insufficient_quota") || b.includes("billing")) hint = "crediti esauriti o fatturazione non attiva";
  else if (status === 429) hint = "troppe richieste o quota esaurita, riprova tra poco";
  else if (provider === "azure" && (status === 404 || b.includes("deploymentnotfound"))) hint = "deployment non trovato: nel campo Modello va il NOME del deployment";
  else if (status === 404 || b.includes("model_not_found") || b.includes("not_found")) hint = "modello non trovato o non disponibile per questa chiave";
  return `Errore dal fornitore AI (${status}${hint ? `: ${hint}` : ""}) ${body.slice(0, 240)}`;
}

export async function suggestGroups(
  t: AiTarget,
  topic: string,
  words: { label: string; count: number }[],
): Promise<AiGroup[]> {
  if (words.length < 2) return [];
  const text = await callModel(t, buildPrompt(topic, words.slice(0, 300)));
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
export async function testKey(t: AiTarget): Promise<void> {
  await callModel(t, 'Rispondi solo con {"ok":true}');
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
  t: AiTarget,
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
  const text = await callModel(t, prompt);
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
  t: AiTarget,
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
  const text = await callModel(t, prompt);
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
