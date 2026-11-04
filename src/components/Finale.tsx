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
 * Corona: le parole del pubblico, come etichette colorate su un anello largo;
 * un tema alla volta, le linee delle sue parole convergono al centro e il tema si accende.
 * I temi stanno impilati al centro: non si sovrappongono mai, né tra loro né all'anello.
 * `portrait` = versione verticale per il telefono.
 */
export function CrownView({ data, title, portrait = false }: { data: CrownData; title: string; portrait?: boolean }) {
  const hasThemes = data.themes.length > 0;
  const known = new Set(data.words.map((w) => w.label));
  const groups = (
    hasThemes
      ? data.themes.map((t) => ({ label: t.label, words: t.words.filter((w) => known.has(w)) }))
      : [{ label: title, words: data.words.map((w) => w.label) }]
  ).filter((g) => g.words.length);

  if (portrait) return <CrownPortrait groups={groups} words={data.words} note={data.note} hasThemes={hasThemes} k={data.generatedAt ?? "static"} />;

  const W = portrait ? 90 : 160;
  const H = portrait ? 130 : 90;
  const CX = W / 2;
  const CY = H / 2;
  const rx = portrait ? 0.32 * W : 0.4 * W;
  const ry = portrait ? 0.41 * H : 0.4 * H;
  // sugli archi alto/basso serve più apertura (lì l'ellisse "schiaccia" le distanze orizzontali)
  const stepArc = (portrait ? 34 : 40) * (Math.PI / 180);
  const stepSide = (portrait ? 16 : 26) * (Math.PI / 180);

  // spicchi: primo gruppo in alto, ultimo in basso, quello di mezzo ai lati
  const deg = Math.PI / 180;
  const angleOf = (gi: number, i: number, k: number): number => {
    const G = groups.length;
    if (G === 1) return -Math.PI / 2 + ((i + 0.5) * 2 * Math.PI) / k;
    const isTop = gi === 0;
    const isBottom = gi === G - 1;
    if (isTop || isBottom) return (isTop ? -90 : 90) * deg + (i - (k - 1) / 2) * stepArc;
    // gruppo centrale: alterna destra e sinistra
    const side = i % 2 === 0 ? 0 : 180;
    const onSide = Math.floor(i / 2);
    const perSide = side === 0 ? Math.ceil(k / 2) : Math.floor(k / 2);
    return side * deg + (onSide - (perSide - 1) / 2) * stepSide;
  };

  const rows = groups.length === 3 ? [0.31, 0.5, 0.69] : groups.length === 2 ? [0.4, 0.6] : [0.5];
  const nodes = groups.map((g, gi) => ({ ...g, x: CX, y: rows[gi] * H }));
  const placed = groups.flatMap((g, gi) =>
    g.words.map((label, i) => {
      const a = angleOf(gi, i, g.words.length);
      return {
        label,
        gi,
        x: CX + rx * Math.cos(a),
        y: CY + ry * Math.sin(a),
        blocks: data.words.find((w) => w.label === label)?.blocks ?? [],
      };
    }),
  );

  const tWords = 0.3;
  const tFirst = tWords + placed.length * 0.16 + 1;
  const per = 2.1;
  const tNote = tFirst + groups.length * per + 0.4;
  const pct = (x: number, y: number) => ({ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` });
  // ordine di comparsa: giro dell'anello in senso orario
  const order = [...placed].sort((a, b) => Math.atan2(a.y - CY, a.x - CX) - Math.atan2(b.y - CY, b.x - CX));

  return (
    <div className={`crown4 ${portrait ? "portrait" : ""}`} key={data.generatedAt ?? "static"}>
      <svg className="c4-lines" viewBox={`0 0 ${W} ${H}`} aria-hidden>
        <ellipse cx={CX} cy={CY} rx={rx} ry={ry} className="c4-orbit" />
        {placed.map((p, k) => {
          const n = nodes[p.gi];
          const mx = (p.x + n.x) / 2 + (CX - p.x) * 0.12;
          const my = (p.y + n.y) / 2;
          return (
            <path
              key={k}
              d={`M ${p.x} ${p.y} Q ${mx} ${my} ${n.x} ${n.y}`}
              pathLength={1}
              className={`t${p.gi + 1}`}
              style={{ animationDelay: `${tFirst + p.gi * per + (k % 3) * 0.12}s` }}
            />
          );
        })}
      </svg>
      {placed.map((p) => (
        <div
          key={p.label}
          className={`c4-word t${p.gi + 1}`}
          style={{ ...pct(p.x, p.y), animationDelay: `${tWords + order.indexOf(p) * 0.16}s, ${tFirst + p.gi * per}s` }}
        >
          <span className="q">“</span>
          {p.label}
          <span className="q">”</span>
          {p.blocks.length > 0 && <small>{p.blocks.join(" · ")}</small>}
        </div>
      ))}
      {nodes.map((n, gi) => (
        <div key={gi} className={`c4-theme t${gi + 1} ${hasThemes ? "" : "plain"}`} style={{ ...pct(n.x, n.y), animationDelay: `${tFirst + gi * per + 0.9}s` }}>
          {n.label}
        </div>
      ))}
      {data.note && (
        <p className="c4-note" style={{ animationDelay: `${tNote}s` }}>
          {data.note}
        </p>
      )}
    </div>
  );
}

/** Corona per schermi stretti: ogni tema è una piccola convergenza (parole → linee → tema), una sotto l'altra. */
function CrownPortrait({
  groups,
  words,
  note,
  hasThemes,
  k,
}: {
  groups: { label: string; words: string[] }[];
  words: CrownData["words"];
  note: string;
  hasThemes: boolean;
  k: string;
}) {
  const per = 1.6;
  return (
    <div className="c4p" key={k}>
      {groups.map((g, gi) => {
        const t = 0.2 + gi * per;
        const n = g.words.length;
        return (
          <section key={gi} className={`c4p-g t${gi + 1}`}>
            <div className="c4p-words">
              {g.words.map((w, wi) => (
                <span key={w} className={`c4-word t${gi + 1} c4p-chip`} style={{ animationDelay: `${t + wi * 0.12}s, 0s` }}>
                  <span className="q">“</span>
                  {w}
                  <span className="q">”</span>
                  <small>{words.find((x) => x.label === w)?.blocks.join(" · ")}</small>
                </span>
              ))}
            </div>
            <svg className="c4p-funnel" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden>
              {g.words.map((w, wi) => (
                <path
                  key={w}
                  d={`M ${n === 1 ? 50 : 14 + (wi * 72) / (n - 1)} 0 L 50 24`}
                  style={{ animationDelay: `${t + 0.5 + wi * 0.08}s` }}
                />
              ))}
            </svg>
            <div className={`c4p-theme ${hasThemes ? "" : "plain"}`} style={{ animationDelay: `${t + 0.9}s` }}>
              {g.label}
            </div>
          </section>
        );
      })}
      {note && (
        <p className="c4p-note" style={{ animationDelay: `${0.2 + groups.length * per + 0.2}s` }}>
          {note}
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
