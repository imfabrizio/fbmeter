"use client";

import { useState } from "react";
import { CrownView, type CrownData, type StripData } from "./Finale";

export interface PublicResultsData {
  strips: StripData[];
  crown: CrownData;
}

type Tab = "topics" | "crown" | "report";

/**
 * Risultati finali per il pubblico (telefono e pagina /r): tre schede
 * "Per argomento", "Convergenza", "Report" con PDF da scaricare o condividere.
 */
export function PublicResults({ title, results, code }: { title: string; results: PublicResultsData; code: string }) {
  const [tab, setTab] = useState<Tab>("topics");
  return (
    <div className="pr">
      <header className="pr-head">
        <div className="pr-kicker">Risultati</div>
        <h1>{title}</h1>
      </header>

      <main className="pr-body">
        {tab === "topics" && <Topics strips={results.strips} />}
        {tab === "crown" && (
          <div className="pr-crown">
            <p className="pr-intro">Le parole più forti di tutti gli argomenti, e i temi in cui convergono.</p>
            <div className="pr-crown-stage">
              <CrownView data={results.crown} title={title} portrait />
            </div>
          </div>
        )}
        {tab === "report" && <Report title={title} results={results} code={code} />}
      </main>

      <nav className="pr-tabs" aria-label="Sezioni dei risultati">
        <button className={tab === "topics" ? "active" : ""} onClick={() => setTab("topics")}>
          <span className="i">☰</span>Per argomento
        </button>
        <button className={tab === "crown" ? "active" : ""} onClick={() => setTab("crown")}>
          <span className="i">◎</span>Convergenza
        </button>
        <button className={tab === "report" ? "active" : ""} onClick={() => setTab("report")}>
          <span className="i">⇩</span>Report
        </button>
      </nav>
    </div>
  );
}

function Topics({ strips }: { strips: StripData[] }) {
  return (
    <div className="pr-topics">
      <p className="pr-intro">Le tre parole più scritte alla fine di ogni argomento.</p>
      {strips.map((s, i) => (
        <article key={s.blockId} className="pr-topic" style={{ animationDelay: `${i * 0.08}s` }}>
          <div className="pr-topic-head">
            <span className="pr-num">{i + 1}</span>
            <h2>{s.title}</h2>
          </div>
          {s.words.length ? (
            <ol className="pr-podium">
              {s.words.map((w, j) => (
                <li key={w.label} className={`p${j + 1}`}>
                  <span className="pos">{j + 1}</span>
                  <span className="w">{w.label}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="pr-headline">{s.headline || "Nessuna risposta"}</p>
          )}
        </article>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */

async function buildPdf(title: string, results: PublicResultsData): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  const M = 18;
  let y = 0;

  // intestazione
  doc.setFillColor(15, 16, 32);
  doc.rect(0, 0, W, 42, "F");
  doc.setTextColor(143, 168, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("RISULTATI DELL'EVENTO", M, 16);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.text(doc.splitTextToSize(title, W - 2 * M), M, 27);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(170, 172, 195);
  doc.text(new Date().toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" }), M, 36);
  y = 56;

  const ensure = (h: number) => {
    if (y + h > 280) {
      doc.addPage();
      y = 22;
    }
  };
  const heading = (t: string) => {
    ensure(16);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(30, 30, 40);
    doc.text(t, M, y);
    doc.setDrawColor(47, 91, 234);
    doc.setLineWidth(0.8);
    doc.line(M, y + 2.5, M + 22, y + 2.5);
    y += 11;
  };

  heading("Argomento per argomento");
  results.strips.forEach((s, i) => {
    ensure(18);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(120, 120, 135);
    doc.text(`${i + 1}. ${s.title.toUpperCase()}`, M, y);
    y += 6;
    const words = s.words.length ? s.words.map((w) => w.label) : [s.headline || "—"];
    let x = M;
    words.forEach((w, j) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(j === 0 ? 15 : j === 1 ? 12.5 : 11);
      if (j === 0) doc.setTextColor(47, 91, 234);
      else doc.setTextColor(j === 1 ? 30 : 110, j === 1 ? 30 : 110, j === 1 ? 40 : 125);
      const wdt = doc.getTextWidth(w);
      if (x + wdt > W - M) {
        y += 7;
        x = M;
      }
      doc.text(w, x, y);
      x += wdt + 7;
    });
    y += 10;
  });

  y += 4;
  heading(results.crown.themes.length ? "Dove convergono" : "Le parole più forti");
  const colors: [number, number, number][] = [
    [79, 110, 235],
    [217, 104, 40],
    [12, 138, 110],
  ];
  if (results.crown.themes.length) {
    results.crown.themes.forEach((t, i) => {
      ensure(20);
      const [r, g, b] = colors[i % 3];
      doc.setFillColor(r, g, b);
      doc.rect(M, y - 5, 1.6, 14, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(r, g, b);
      doc.text(t.label, M + 5, y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(90, 90, 105);
      doc.text(doc.splitTextToSize(t.words.join("  ·  "), W - 2 * M - 5), M + 5, y + 6);
      y += 18;
    });
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(30, 30, 40);
    doc.text(doc.splitTextToSize(results.crown.words.map((w) => w.label).join("  ·  "), W - 2 * M), M, y);
    y += 14;
  }
  if (results.crown.note) {
    ensure(18);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(11);
    doc.setTextColor(50, 50, 60);
    doc.text(doc.splitTextToSize(results.crown.note, W - 2 * M), M, y);
  }

  // piè di pagina
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 160);
    doc.text("Generato con FBMeter dalle risposte del pubblico", M, 290);
    doc.text(`${p}/${pages}`, W - M, 290, { align: "right" });
  }
  return doc.output("blob");
}

function Report({ title, results, code }: { title: string; results: PublicResultsData; code: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const filename = `risultati-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || code}.pdf`;
  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  async function download() {
    setBusy(true);
    setMsg(null);
    try {
      const blob = await buildPdf(title, results);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch {
      setMsg("Non è stato possibile creare il PDF.");
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    setBusy(true);
    setMsg(null);
    try {
      const blob = await buildPdf(title, results);
      const file = new File([blob], filename, { type: "application/pdf" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `Risultati – ${title}` });
      } else {
        await navigator.share({ title: `Risultati – ${title}`, url: `${location.origin}/r/${code}` });
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) setMsg("Condivisione non disponibile: scarica il PDF.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pr-report">
      <div className="pr-report-card">
        <div className="pr-report-icon">PDF</div>
        <h2>Il report dell&apos;evento</h2>
        <p>Le parole di ogni argomento e i temi in cui convergono, in un PDF da tenere o inoltrare.</p>
        <button className="btn primary block" disabled={busy} onClick={download}>
          {busy ? "Preparazione…" : "Scarica il report"}
        </button>
        {canShare && (
          <button className="btn block" disabled={busy} onClick={share}>
            Condividi (mail, WhatsApp…)
          </button>
        )}
        {msg && <div className="alert warn">{msg}</div>}
      </div>
    </div>
  );
}
