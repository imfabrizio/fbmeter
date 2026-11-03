"use client";

export interface CloudWord {
  label: string;
  count: number;
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Nuvola di parole senza librerie: le più frequenti al centro, dimensione ∝ √conteggio.
 * `scale` moltiplica la dimensione base (em), utile sul proiettore.
 */
export function WordCloud({
  words,
  max = 50,
  scale = 1,
  showCounts = false,
  empty = "Ancora nessuna risposta",
}: {
  words: CloudWord[];
  max?: number;
  scale?: number;
  showCounts?: boolean;
  empty?: string;
}) {
  const list = words.slice(0, max);
  if (!list.length) return <p className="muted center">{empty}</p>;
  const top = list[0].count || 1;

  // dispone le parole alternandole ai lati: le grandi finiscono al centro
  const arranged: CloudWord[] = [];
  list.forEach((w, i) => (i % 2 === 0 ? arranged.push(w) : arranged.unshift(w)));

  return (
    <div className="cloud" aria-label="Nuvola di parole">
      {arranged.map((w) => {
        const size = (1 + 3.4 * Math.sqrt(w.count / top)) * scale;
        const color = `var(--c${(hash(w.label) % 6) + 1})`;
        return (
          <span key={w.label} style={{ fontSize: `${size.toFixed(2)}em`, color }} title={`${w.label}: ${w.count}`}>
            {w.label}
            {showCounts && <sup>{w.count}</sup>}
          </span>
        );
      })}
    </div>
  );
}
