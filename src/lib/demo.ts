/**
 * Risposte di prova realistiche, per provare regia, proiettore e risultati senza pubblico.
 * Le parole includono di proposito varianti (maiuscole, accenti, plurali) per mostrare la normalizzazione.
 */

interface Vocab {
  before: string[];
  after: string[];
}

const TOPICS: { match: RegExp; vocab: Vocab }[] = [
  {
    match: /entra|identit|azure ad|aad/i,
    vocab: {
      before: ["identità", "Identita", "login", "password", "utenti", "Utente", "Azure AD", "sicurezza", "account", "SSO", "autenticazione", "accesso"],
      after: ["MFA", "Conditional Access", "accesso condizionale", "Zero Trust", "identità", "PIM", "passwordless", "rischio", "SSO", "governance", "MFA", "Conditional Access"],
    },
  },
  {
    match: /sharepoint|onedrive|teams|collabor/i,
    vocab: {
      before: ["documenti", "file", "condivisione", "intranet", "cartelle", "Teams", "archivio", "OneDrive", "siti", "collaborazione"],
      after: ["permessi", "etichette", "Purview", "DLP", "condivisione esterna", "governance", "versioni", "collaborazione", "sensitivity label", "accessi"],
    },
  },
  {
    match: /defender|xdr|edr|antivirus/i,
    vocab: {
      before: ["antivirus", "virus", "malware", "protezione", "sicurezza", "firewall", "endpoint", "minacce", "Antivirus"],
      after: ["XDR", "EDR", "incidenti", "automazione", "phishing", "ransomware", "risposta", "correlazione", "Sentinel", "XDR", "EDR"],
    },
  },
  {
    match: /fortinet|fortigate|firewall|sd-?wan/i,
    vocab: {
      before: ["firewall", "Firewall", "VPN", "rete", "router", "sicurezza", "perimetro", "porte", "UTM"],
      after: ["SD-WAN", "ZTNA", "Security Fabric", "SASE", "FortiGate", "segmentazione", "VPN", "integrazione", "SD-WAN", "visibilità"],
    },
  },
  {
    match: /intune|endpoint|device|dispositiv/i,
    vocab: {
      before: ["dispositivi", "pc", "PC", "telefoni", "smartphone", "gestione", "aggiornamenti", "software", "inventario"],
      after: ["compliance", "Autopilot", "criteri", "MDM", "app protection", "conformità", "BYOD", "aggiornamenti", "Autopilot", "compliance"],
    },
  },
  {
    match: /azure|cloud|infrastrutt/i,
    vocab: {
      before: ["cloud", "Cloud", "server", "costi", "datacenter", "macchine virtuali", "storage", "Microsoft", "scalabilità"],
      after: ["landing zone", "backup", "disaster recovery", "costi", "governance", "Azure Arc", "sicurezza", "scalabilità", "backup", "FinOps"],
    },
  },
];

const GENERIC: Vocab = {
  before: ["sicurezza", "Sicurezza", "tecnologia", "Microsoft", "complessità", "costi", "cloud", "utenti", "dati", "innovazione"],
  after: ["protezione", "automazione", "governance", "semplicità", "sicurezza", "integrazione", "visibilità", "controllo", "dati", "efficienza"],
};

const COMMENTS = [
  "Molto utile, soprattutto la demo",
  "Mi piacerebbe un approfondimento sulle licenze",
  "Chiaro e concreto",
  "Più esempi pratici dai clienti",
  "Ottimo il confronto prima e dopo",
  "Interessante la parte sull'integrazione",
  "Vorrei le slide",
  "Tempo un po' stretto per le domande",
  "Utile per spiegare il valore ai clienti",
  "Bella la parte su Zero Trust",
];

/** Generatore pseudo-casuale con seme: stessi dati a parità di input. */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function pick<T>(r: () => number, list: T[], skew = 1.6): T {
  // distribuzione sbilanciata verso le prime voci, così emergono parole dominanti
  return list[Math.floor(Math.pow(r(), skew) * list.length)];
}

export interface DemoQuestion {
  id: string;
  type: string;
  maxWords: number;
  options: string[];
  multiple: boolean;
  correct: number[];
  scaleMin: number;
  scaleMax: number;
  /** posizione tra le domande a parole del blocco: 0 = prima, >0 = successive */
  wordsIndex: number;
  blockTitle: string;
}

export function demoAnswer(q: DemoQuestion, participant: number, seed: number) {
  const r = rng(seed * 7919 + participant * 104729 + q.id.charCodeAt(0) * 31 + q.id.charCodeAt(5));
  const empty = { words: [] as string[], choices: [] as number[], scale: null as number | null, textValue: null as string | null };
  switch (q.type) {
    case "words": {
      const vocab = TOPICS.find((t) => t.match.test(q.blockTitle))?.vocab ?? GENERIC;
      const pool = q.wordsIndex === 0 ? vocab.before : vocab.after;
      const n = Math.max(1, Math.min(q.maxWords, 1 + Math.floor(r() * q.maxWords)));
      const words: string[] = [];
      for (let i = 0; i < n * 3 && words.length < n; i++) {
        const w = pick(r, pool);
        if (!words.some((x) => x.toLowerCase() === w.toLowerCase())) words.push(w);
      }
      return { ...empty, words };
    }
    case "choice": {
      const idx = [...q.options.keys()];
      if (q.multiple) {
        const chosen = idx.filter(() => r() < 0.4);
        return { ...empty, choices: chosen.length ? chosen : [pick(r, idx)] };
      }
      return { ...empty, choices: [pick(r, idx, 1.3)] };
    }
    case "quiz": {
      if (r() < 0.7 && q.correct.length) return { ...empty, choices: q.multiple ? [...q.correct] : [q.correct[0]] };
      const wrong = [...q.options.keys()].filter((i) => !q.correct.includes(i));
      return { ...empty, choices: [wrong.length ? pick(r, wrong) : 0] };
    }
    case "scale": {
      const span = q.scaleMax - q.scaleMin;
      // valutazioni tendenzialmente positive
      const v = q.scaleMax - Math.floor(Math.pow(r(), 2.2) * (span + 1));
      return { ...empty, scale: Math.max(q.scaleMin, Math.min(q.scaleMax, v)) };
    }
    case "open":
      return { ...empty, textValue: pick(r, COMMENTS, 1) };
    default:
      return empty;
  }
}

const NAMES = ["Luca", "Giulia", "Marco", "Sara", "Paolo", "Elena", "Andrea", "Chiara", "Davide", "Francesca", "Matteo", "Laura", "Simone", "Anna", "Stefano", "Marta", "Roberto", "Silvia", "Alessio", "Valentina"];

export function demoNickname(i: number) {
  return `${NAMES[i % NAMES.length]} (prova ${i + 1})`;
}
