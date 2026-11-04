"use client";

import { CrownView, RevealView, StripsView, type CrownData, type RevealData, type StripData } from "@/components/Finale";
import { ResultView, type ResultData } from "@/components/ResultView";
import { usePolling } from "@/components/usePolling";
import { useEffect, useState } from "react";

/** Pulsante schermo intero: compare solo quando si muove il mouse. */
function FullscreenButton() {
  const [visible, setVisible] = useState(true);
  const [isFs, setIsFs] = useState(false);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const show = () => {
      setVisible(true);
      clearTimeout(t);
      t = setTimeout(() => setVisible(false), 2500);
    };
    const onFs = () => setIsFs(!!document.fullscreenElement);
    show();
    window.addEventListener("mousemove", show);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      clearTimeout(t);
      window.removeEventListener("mousemove", show);
      document.removeEventListener("fullscreenchange", onFs);
    };
  }, []);
  return (
    <button
      className="fs-btn"
      style={{ opacity: visible ? 1 : 0 }}
      onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {})}
    >
      {isFs ? "Esci da schermo intero" : "⛶ Schermo intero"}
    </button>
  );
}

interface Live {
  title: string;
  code: string;
  joinUrl: string;
  participants: number;
  mode: "live" | "join" | "reveal" | "preparing" | "strips" | "crown" | "qa";
  preparingTitle?: string;
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
  reveal?: RevealData & { blockId: string };
  strips?: StripData[];
  crown?: CrownData;
  qa?: { id: string; text: string; votes: number }[];
}

/** Schermo per il proiettore: lo pilota la regia, qui non si clicca nulla. */
export function PresenterScreen({ code, preview = false }: { code: string; preview?: boolean }) {
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

  const heading = (kicker: string, title: string) => (
    <div>
      <div className="s-kicker">{kicker}</div>
      <h1 className="s-prompt">{title}</h1>
    </div>
  );

  let top: React.ReactNode = <div className="s-kicker">{data.title}</div>;
  let body: React.ReactNode;
  let foot: React.ReactNode = null;
  let showJoinCorner = true;

  if (data.mode === "reveal" && data.reveal) {
    top = heading(data.title, `${data.reveal.title}: cosa è cambiato`);
    showJoinCorner = false;
    body = <RevealView key={data.reveal.blockId + data.reveal.before.length + data.reveal.after.length} data={data.reveal} />;
  } else if (data.mode === "preparing") {
    top = heading(data.title, data.preparingTitle ? `${data.preparingTitle}: cosa è cambiato` : "Un momento…");
    body = <p style={{ fontSize: "clamp(18px, 2vw, 36px)", color: "var(--muted)" }}>Sto mettendo a confronto le vostre parole…</p>;
  } else if (data.mode === "strips" && data.strips) {
    top = heading(data.title, "Le vostre parole, argomento per argomento");
    showJoinCorner = false;
    body = <StripsView strips={data.strips} />;
  } else if (data.mode === "crown" && data.crown) {
    top = heading(data.title, "Dove convergono");
    showJoinCorner = false;
    body = <CrownView data={data.crown} title={data.title} />;
  } else if (data.mode === "qa" && data.qa) {
    top = heading(data.title, "Le vostre domande");
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
    top = heading(`${a.blockIndex}/${a.blockCount} · ${a.blockTitle}${a.label ? ` · ${a.label}` : ""}`, a.prompt);
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
      {!preview && <FullscreenButton />}
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
