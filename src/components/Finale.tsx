"use client";

/**
 * Le tre viste "ad effetto": rivelazione prima/dopo, strisce per argomento, corona di convergenza.
 * Animazioni solo CSS: ripartono ogni volta che il componente viene montato (chiave = contenuto).
 */

export interface RevealWord {
  label: string;
  count: number;
}

export interface RevealData {
  title: string;
  beforeLabel: string;
  afterLabel: string;
  beforeRespondents: number;
  afterRespondents: number;
  before: RevealWord[];
  common: RevealWord[];
  after: RevealWord[];
  links: { from: string; to: string }[];
  note: string;
}

const rowY = (i: number, n: number, gap = 24, base = 52) => base + (i - (n - 1) / 2) * gap;

/** Prima a sinistra, dopo a destra, rimaste al centro, linee tra le parole "evolute". */
export function RevealView({ data }: { data: RevealData }) {
  const { before, common, after, links } = data;
  // con parole rimaste: quelle stanno in alto al centro e le colonne scendono, così le linee restano libere
  const base = common.length ? 64 : 52;
  const yB = (label: string) => rowY(before.findIndex((w) => w.label === label), before.length, 24, base);
  const yA = (label: string) => rowY(after.findIndex((w) => w.label === label), after.length, 24, base);
  const drawn = links.filter((l) => before.some((w) => w.label === l.from) && after.some((w) => w.label === l.to));
  const tAfter = 0.4 + before.length * 0.35 + 0.6;
  const tCommon = tAfter + after.length * 0.35 + 0.5;
  const tLinks = tCommon + (common.length ? 0.9 : 0.2);

  return (
    <div className="rv" key={JSON.stringify([before, common, after, links])}>
      <div className="rv-head" style={{ left: "16%" }}>
        {data.beforeLabel} <small>{data.beforeRespondents} risposte</small>
      </div>
      {common.length > 0 && (
        <div className="rv-head rv-head-center" style={{ left: "50%", animationDelay: `${tCommon}s` }}>
          {common.length === 1 ? "È rimasta" : "Sono rimaste"}
        </div>
      )}
      <div className="rv-head" style={{ left: "84%", animationDelay: `${tAfter}s` }}>
        {data.afterLabel} <small>{data.afterRespondents} risposte</small>
      </div>

      <svg className="rv-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        {drawn.map((l, i) => {
          const y1 = yB(l.from);
          const y2 = yA(l.to);
          return (
            <path
              key={i}
              d={`M 31 ${y1} C 50 ${y1}, 50 ${y2}, 69 ${y2}`}
              style={{ animationDelay: `${tLinks + i * 0.5}s` }}
            />
          );
        })}
      </svg>

      {before.map((w, i) => (
        <div key={w.label} className="rv-word rv-before" style={{ left: "30%", top: `${rowY(i, before.length, 24, base)}%`, animationDelay: `${0.4 + i * 0.35}s` }}>
          {w.label}
          <small>{w.count}</small>
        </div>
      ))}
      {common.map((w, i) => (
        <div key={w.label} className="rv-word rv-common" style={{ left: "50%", top: `${17 + i * 15}%`, animationDelay: `${tCommon + i * 0.3}s` }}>
          {w.label}
          <small>{w.count}</small>
        </div>
      ))}
      {after.map((w, i) => (
        <div key={w.label} className="rv-word rv-after" style={{ left: "70%", top: `${rowY(i, after.length, 24, base)}%`, animationDelay: `${tAfter + i * 0.35}s` }}>
          {w.label}
          <small>{w.count}</small>
        </div>
      ))}
      {before.length + common.length + after.length === 0 && <p className="rv-empty">Ancora nessuna risposta per il confronto.</p>}
      {data.note && (
        <p className="rv-note" style={{ animationDelay: `${tLinks + drawn.length * 0.5 + 0.4}s` }}>
          {data.note}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export interface StripData {
  blockId: string;
  title: string;
  words: RevealWord[];
  headline: string;
  respondents: number;
}

/** Una riga per argomento con tre parole grandi. */
export function StripsView({ strips, animate = true }: { strips: StripData[]; animate?: boolean }) {
  return (
    <div className={`strips ${animate ? "anim" : ""}`}>
      {strips.map((s, i) => (
        <div key={s.blockId} className="strip" style={{ animationDelay: `${0.2 + i * 0.35}s` }}>
          <div className="strip-title">{s.title}</div>
          <div className="strip-words">
            {s.words.length ? (
              s.words.map((w, j) => (
                <span key={w.label} className={`strip-word r${j + 1}`}>
                  {w.label}
                </span>
              ))
            ) : s.headline ? (
              <span className="strip-word r2">{s.headline}</span>
            ) : (
              <span className="strip-empty">nessuna risposta</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export interface CrownData {
  words: { label: string; count: number; blocks: string[] }[];
  themes: { label: string; words: string[] }[];
  note: string;
  generatedAt: string | null;
}

const W = 160;
const H = 90;
const CX = W / 2;
const CY = H / 2;

/**
 * Corona: le parole del pubblico su un anello largo; le linee convergono verso il centro
 * dove compaiono, uno alla volta, i macro-temi generati dall'AI.
 */
export function CrownView({ data, title }: { data: CrownData; title: string }) {
  const hasThemes = data.themes.length > 0;
  const themes = hasThemes ? data.themes : [{ label: title, words: data.words.map((w) => w.label) }];

  // parole ordinate per tema, così le linee di uno stesso tema non si incrociano
  const ordered = themes.flatMap((t, ti) => t.words.map((label) => ({ label, ti }))).filter((w) => data.words.some((x) => x.label === w.label));
  const n = Math.max(ordered.length, 1);
  const rx = 64;
  const ry = 36;
  const placed = ordered.map((w, k) => {
    const a = -Math.PI / 2 + ((k + 0.5) * 2 * Math.PI) / n;
    return { ...w, a, x: CX + rx * Math.cos(a), y: CY + ry * Math.sin(a) };
  });

  // ogni tema si posiziona verso il "suo" spicchio dell'anello
  const nodes = themes.map((t, ti) => {
    const mine = placed.filter((p) => p.ti === ti);
    if (!hasThemes || !mine.length) return { ...t, x: CX, y: CY };
    const sx = mine.reduce((s, p) => s + Math.cos(p.a), 0);
    const sy = mine.reduce((s, p) => s + Math.sin(p.a), 0);
    const a = Math.atan2(sy, sx);
    return { ...t, x: CX + 27 * Math.cos(a), y: CY + 16 * Math.sin(a) };
  });

  const tWords = 0.3;
  const tLines = tWords + n * 0.18 + 0.8;
  const perTheme = 1.7;
  const tNote = tLines + themes.length * perTheme + 0.3;
  const pct = (x: number, y: number) => ({ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` });

  return (
    <div className="crown" key={data.generatedAt ?? "static"}>
      <svg className="crown-lines" viewBox={`0 0 ${W} ${H}`} aria-hidden>
        {placed.map((p, k) => {
          const node = nodes[p.ti];
          // leggera curva verso il centro
          const mx = (p.x + node.x) / 2 + (CX - (p.x + node.x) / 2) * 0.25;
          const my = (p.y + node.y) / 2 + (CY - (p.y + node.y) / 2) * 0.25;
          return (
            <path
              key={k}
              d={`M ${p.x} ${p.y} Q ${mx} ${my} ${node.x} ${node.y}`}
              pathLength={1}
              className={`t${p.ti + 1}`}
              style={{ animationDelay: `${tLines + p.ti * perTheme + (k % 4) * 0.12}s` }}
            />
          );
        })}
      </svg>
      {placed.map((p, k) => {
        const w = data.words.find((x) => x.label === p.label)!;
        return (
          <div key={p.label} className={`crown-word t${p.ti + 1}`} style={{ ...pct(p.x, p.y), animationDelay: `${tWords + k * 0.18}s` }}>
            {p.label}
            <small>{w.blocks.join(" · ")}</small>
          </div>
        );
      })}
      {nodes.map((t, ti) => (
        <div
          key={ti}
          className={`crown-theme t${ti + 1} ${hasThemes ? "" : "plain"}`}
          style={{ ...pct(t.x, t.y), animationDelay: `${tLines + ti * perTheme + 0.9}s` }}
        >
          {t.label}
        </div>
      ))}
      {data.note && (
        <p className="crown-note" style={{ animationDelay: `${tNote}s` }}>
          {data.note}
        </p>
      )}
    </div>
  );
}

/** Versione statica e verticale per telefoni e pagina risultati. */
export function ThemesList({ data }: { data: CrownData }) {
  if (!data.themes.length) {
    return (
      <div className="podium">
        {data.words.map((w) => (
          <span key={w.label} className="pill">
            {w.label}
          </span>
        ))}
      </div>
    );
  }
  return (
    <div className="themes-list">
      {data.themes.map((t, i) => (
        <div key={i} className={`theme-card t${i + 1}`}>
          <div className="theme-label">{t.label}</div>
          <div className="theme-words">{t.words.join(" · ")}</div>
        </div>
      ))}
      {data.note && <p className="theme-note">{data.note}</p>}
    </div>
  );
}
