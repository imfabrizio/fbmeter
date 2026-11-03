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

/**
 * Convergenza: le parole compaiono su un anello largo, poi (un tema alla volta) volano
 * in tre colonne e sotto ciascuna si accende il macro-tema. Stato finale: tre colonne pulite.
 */
export function CrownView({ data, title }: { data: CrownData; title: string }) {
  const hasThemes = data.themes.length > 0;
  const known = new Set(data.words.map((w) => w.label));
  const groups = hasThemes
    ? data.themes.map((t) => ({ label: t.label, words: t.words.filter((w) => known.has(w)) })).filter((g) => g.words.length)
    : [{ label: title, words: data.words.map((w) => w.label) }];

  // anello: ordine per gruppo, così ogni gruppo parte da uno spicchio vicino alla sua colonna
  const ring = groups.flatMap((g, gi) => g.words.map((label) => ({ label, gi })));
  const n = Math.max(ring.length, 1);
  const cols = groups.length;
  const colX = (gi: number) => (cols === 1 ? 50 : 17 + (gi * 66) / (cols - 1));

  const tAppear = 0.3;
  const stepAppear = 0.22;
  // tutte le parole volano insieme; poi i temi si accendono uno alla volta
  const tFly = tAppear + n * stepAppear + 1.4;
  const tThemes = tFly + 1.6;
  const perGroup = 1.3;
  const tNote = tThemes + cols * perGroup + 0.5;

  const items = ring.map((w, k) => {
    const a = -Math.PI / 2 + ((k + 0.5) * 2 * Math.PI) / n;
    const g = groups[w.gi];
    const slot = g.words.indexOf(w.label);
    const gap = Math.min(14, 50 / g.words.length);
    const x1 = hasThemes ? colX(w.gi) : 50 + 40 * Math.cos(a);
    const y1 = hasThemes ? 18 + slot * gap : 47 + 36 * Math.sin(a);
    return {
      ...w,
      x0: 50 + 40 * Math.cos(a),
      y0: 47 + 36 * Math.sin(a),
      x1,
      y1,
      d1: tAppear + k * stepAppear,
      d2: tFly + k * 0.06,
      blocks: data.words.find((x) => x.label === w.label)?.blocks ?? [],
    };
  });

  return (
    <div className={`crown2 ${hasThemes ? "" : "static"}`} key={data.generatedAt ?? "static"}>
      {hasThemes &&
        groups.map((g, gi) => (
          <div
            key={`col${gi}`}
            className={`c2-col t${gi + 1}`}
            style={{ left: `${colX(gi)}%`, animationDelay: `${tFly + 0.3 + gi * 0.15}s` }}
            aria-hidden
          />
        ))}
      {items.map((w) => (
        <div
          key={w.label}
          className={`c2-word t${w.gi + 1}`}
          style={
            {
              "--x0": `${w.x0}%`,
              "--y0": `${w.y0}%`,
              "--x1": `${w.x1}%`,
              "--y1": `${w.y1}%`,
              animationDelay: `${w.d1}s, ${w.d2}s`,
            } as React.CSSProperties
          }
        >
          {w.label}
          <small>{w.blocks.join(" · ")}</small>
        </div>
      ))}
      {groups.map((g, gi) => (
        <div
          key={`th${gi}`}
          className={`c2-theme t${gi + 1} ${hasThemes ? "" : "plain"}`}
          style={{
            left: `${hasThemes ? colX(gi) : 50}%`,
            top: hasThemes ? "75%" : "47%",
            animationDelay: `${hasThemes ? tThemes + gi * perGroup : tAppear + n * stepAppear + 0.4}s`,
          }}
        >
          {g.label}
        </div>
      ))}
      {data.note && (
        <p className="c2-note" style={{ animationDelay: `${tNote}s` }}>
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
