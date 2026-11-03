"use client";

import { ResultHeadline, ResultView, type ResultData } from "@/components/ResultView";
import { usePolling } from "@/components/usePolling";

interface Live {
  title: string;
  code: string;
  joinUrl: string;
  participants: number;
  mode: "live" | "join" | "compare" | "final" | "qa";
  active?: {
    blockTitle: string;
    blockIndex: number;
    blockCount: number;
    label: string;
    type: string;
    prompt: string;
    revealed: boolean;
    result: ResultData;
  } | null;
  compare?: { title: string; sides: { label: string; result: ResultData }[] };
  final?: { title: string; items: { label: string; result: ResultData }[] }[];
  qa?: { id: string; text: string; votes: number }[];
}

/** Schermo per il proiettore: lo pilota la regia, qui non si clicca nulla. */
export function PresenterScreen({ code }: { code: string }) {
  const { data, error } = usePolling<Live>(`/api/p/${code}/live`, 2000);
  const qr = `/api/p/${code}/qr`;

  if (!data) {
    return (
      <div className="screen" style={{ alignItems: "center", justifyContent: "center" }}>
        <p>{error ?? "Caricamento…"}</p>
      </div>
    );
  }

  const host = data.joinUrl.replace(/^https?:\/\//, "").replace(/\/e\/.*$/, "");
  const smallJoin = (
    <div className="s-join">
      <div className="qr-box">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt="QR code per partecipare" width={110} height={110} />
      </div>
      <div>
        <div>Partecipa su {host}</div>
        <div className="s-code">{data.code}</div>
        <div>{data.participants} connessi</div>
      </div>
    </div>
  );

  let top: React.ReactNode = <div className="s-kicker">{data.title}</div>;
  let body: React.ReactNode;
  let foot: React.ReactNode = null;
  let showJoinCorner = true;

  if (data.mode === "final" && data.final) {
    top = (
      <div>
        <div className="s-kicker">{data.title}</div>
        <h1 className="s-prompt">Cosa vi portate a casa</h1>
      </div>
    );
    body = (
      <div className="final">
        {data.final.map((b) => (
          <div key={b.title} className="fcard">
            <h3>{b.title}</h3>
            {b.items.map((it, i) =>
              it.result.type === "words" && it.result.words.length ? (
                <ol key={i}>
                  {it.result.words.slice(0, 3).map((w) => (
                    <li key={w.label}>
                      {w.label}
                      <span>{w.count}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p key={i} style={{ fontSize: "clamp(16px, 1.5vw, 28px)", fontWeight: 700 }}>
                  {b.items.length > 1 && <span style={{ color: "var(--muted)", fontWeight: 500 }}>{it.label}: </span>}
                  <ResultHeadline result={it.result} />
                </p>
              ),
            )}
          </div>
        ))}
        {data.final.length === 0 && <p style={{ color: "var(--muted)" }}>Nessuna domanda è segnata per il riepilogo.</p>}
      </div>
    );
  } else if (data.mode === "compare" && data.compare) {
    top = (
      <div>
        <div className="s-kicker">{data.title}</div>
        <h1 className="s-prompt">
          {data.compare.title}
          {data.compare.sides.length === 2 && `: ${data.compare.sides[0].label.toLowerCase()} e ${data.compare.sides[1].label.toLowerCase()}`}
        </h1>
      </div>
    );
    body = (
      <div className="compare" style={{ gridTemplateColumns: `repeat(${Math.max(1, data.compare.sides.length)}, 1fr)` }}>
        {data.compare.sides.map((s, i) => (
          <div key={i}>
            <h3>
              {s.label} · {s.result.respondents} risposte
            </h3>
            <ResultView result={s.result} cloudMax={25} />
          </div>
        ))}
        {data.compare.sides.length === 0 && <p>Questo blocco non ha domande a parole.</p>}
      </div>
    );
  } else if (data.mode === "qa" && data.qa) {
    top = (
      <div>
        <div className="s-kicker">{data.title}</div>
        <h1 className="s-prompt">Le vostre domande</h1>
      </div>
    );
    body = (
      <ul className="qa-screen">
        {data.qa.length === 0 && <li>Nessuna domanda per ora</li>}
        {data.qa.map((q) => (
          <li key={q.id}>
            <b>▲ {q.votes}</b>
            {q.text}
          </li>
        ))}
      </ul>
    );
  } else if (data.mode === "live" && data.active) {
    const a = data.active;
    top = (
      <div>
        <div className="s-kicker">
          {a.blockIndex}/{a.blockCount} · {a.blockTitle}
          {a.label && ` · ${a.label}`}
        </div>
        <h1 className="s-prompt">{a.prompt}</h1>
      </div>
    );
    body = (
      <div className="s-result" style={a.type === "words" ? { width: "auto", fontSize: "inherit" } : undefined}>
        <ResultView result={a.result} revealed={a.revealed} empty="Rispondete dal telefono: i risultati compariranno qui" />
      </div>
    );
    foot = `${a.result.respondents} risposte`;
  } else {
    // nessuna domanda aperta o modalità "join": grande QR di benvenuto
    showJoinCorner = false;
    body = (
      <div className="bigjoin">
        <h1 className="s-prompt" style={{ maxWidth: "none", marginBottom: "0.6em" }}>
          {data.title}
        </h1>
        <div className="qr-box">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="QR code per partecipare" style={{ width: "min(38vh, 38vw)", height: "auto" }} />
        </div>
        <p style={{ fontSize: "clamp(16px, 1.8vw, 34px)", marginTop: "0.8em" }}>
          Inquadra il QR o vai su <b>{host}</b> e inserisci <b className="s-code">{data.code}</b>
        </p>
        <p style={{ color: "var(--muted)" }}>{data.participants} connessi</p>
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="s-top">
        {top}
        {showJoinCorner && smallJoin}
      </div>
      <div className="s-body">{body}</div>
      <div className="s-foot">
        <span>{foot}</span>
        {error && <span>{error}</span>}
      </div>
    </div>
  );
}
