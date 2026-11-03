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

/** Posizioni "a costellazione" deterministiche per il prologo (niente casualità tra un refresh e l'altro). */
function scatter(k: number, n: number) {
  const golden = 2.399963;
  const r = 0.45 + 0.55 * Math.sqrt((k + 0.5) / n);
  const a = k * golden;
  return { x: 50 + 40 * r * Math.cos(a), y: 50 + 36 * r * Math.sin(a) };
}

/**
 * Convergenza, come una sigla: prologo con le parole sparse; poi, un tema alla volta,
 * le sue parole compaiono al centro, si fondono e ne emerge il tema, che scivola al suo posto.
 * Finale: tre righe centrate, tema grande e parole sotto.
 */
export function CrownView({ data, title }: { data: CrownData; title: string }) {
  const hasThemes = data.themes.length > 0;
  const known = new Set(data.words.map((w) => w.label));
  const groups = (
    hasThemes
      ? data.themes.map((t) => ({ label: t.label, words: t.words.filter((w) => known.has(w)) }))
      : [{ label: title, words: data.words.map((w) => w.label) }]
  ).filter((g) => g.words.length);

  // il primo tema va in alto, il secondo in basso, l'ultimo resta al centro: il palco resta sempre libero
  const slots = groups.length === 3 ? [20, 80, 50] : groups.length === 2 ? [32, 68] : [50];
  const all = data.words.map((w) => w.label);

  const tPrelude = 0.2;
  const tStage = tPrelude + 0.18 * all.length + 1.6;
  const per = 3.2;
  const tNote = tStage + groups.length * per + 0.2;

  return (
    <div className="cv" key={data.generatedAt ?? "static"}>
      {all.map((w, k) => {
        const p = scatter(k, all.length);
        return (
          <span
            key={`p-${w}`}
            className="cv-prelude"
            style={{ left: `${p.x}%`, top: `${p.y}%`, animationDelay: `${tPrelude + k * 0.18}s, ${tStage - 0.9}s` }}
          >
            {w}
          </span>
        );
      })}

      {groups.map((g, gi) => {
        const t = tStage + gi * per;
        return (
          <div key={`g-${gi}`}>
            <div className="cv-intro" style={{ animationDelay: `${t}s` }} aria-hidden>
              {g.words.map((w, wi) => (
                <span key={w} style={{ animationDelay: `${t + wi * 0.15}s` }}>
                  {w}
                </span>
              ))}
            </div>
            <div className="cv-group" style={{ "--yf": `${slots[gi] ?? 50}%`, animationDelay: `${t + 1.55}s` } as React.CSSProperties}>
              <div className="cv-theme">{g.label}</div>
              <div className="cv-words" style={{ animationDelay: `${t + 2.9}s` }}>
                {g.words.join("  ·  ")}
              </div>
            </div>
          </div>
        );
      })}

      {data.note && (
        <p className="cv-note" style={{ animationDelay: `${tNote}s` }}>
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
