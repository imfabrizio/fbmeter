"use client";

import { usePolling } from "@/components/usePolling";
import { WordCloud, type CloudWord } from "@/components/WordCloud";

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
    phase: "pre" | "post";
    prompt: string;
    respondents: number;
    words: CloudWord[];
  } | null;
  compare?: {
    title: string;
    pre: { respondents: number; words: CloudWord[] };
    post: { respondents: number; words: CloudWord[] };
  };
  final?: { title: string; respondents: number; top: CloudWord[]; preTop: CloudWord[] }[];
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
            {b.top.length ? (
              <ol>
                {b.top.map((w) => (
                  <li key={w.label}>
                    {w.label}
                    <span>{w.count}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p style={{ color: "var(--muted)" }}>nessuna risposta</p>
            )}
          </div>
        ))}
      </div>
    );
  } else if (data.mode === "compare" && data.compare) {
    top = (
      <div>
        <div className="s-kicker">{data.title}</div>
        <h1 className="s-prompt">{data.compare.title}: prima e dopo</h1>
      </div>
    );
    body = (
      <div className="compare">
        <div>
          <h3>Prima · {data.compare.pre.respondents} risposte</h3>
          <WordCloud words={data.compare.pre.words} max={25} />
        </div>
        <div>
          <h3>Dopo · {data.compare.post.respondents} risposte</h3>
          <WordCloud words={data.compare.post.words} max={25} />
        </div>
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
          {a.blockIndex}/{a.blockCount} · {a.blockTitle} · {a.phase === "pre" ? "prima" : "dopo"}
        </div>
        <h1 className="s-prompt">{a.prompt}</h1>
      </div>
    );
    body = <WordCloud words={a.words} max={60} empty="Rispondete dal telefono: le parole compariranno qui" />;
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
        <span>{data.mode === "live" && data.active ? `${data.active.respondents} risposte` : ""}</span>
        {error && <span>{error}</span>}
      </div>
    </div>
  );
}
