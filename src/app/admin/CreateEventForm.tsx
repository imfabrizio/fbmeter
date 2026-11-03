"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "@/components/usePolling";

export function CreateEventForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [blocks, setBlocks] = useState("");
  const [template, setTemplate] = useState("prepost");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await postJson<{ id: string }>("/api/admin/events", {
        title,
        blocks: blocks.split("\n").map((s) => s.trim()).filter(Boolean),
        template,
      });
      router.push(`/admin/events/${r.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Errore");
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <h2>Nuovo evento</h2>
      <label className="field">
        <span>Titolo</span>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Es. Security Day con il partner" required />
      </label>
      <label className="field">
        <span>Blocchi o sezioni, uno per riga</span>
        <textarea rows={6} value={blocks} onChange={(e) => setBlocks(e.target.value)} placeholder={"Entra ID\nSharePoint\nDefender\nFortinet\nIntune\nAzure"} />
      </label>
      <label className="field">
        <span>Domande di partenza per ogni blocco</span>
        <select value={template} onChange={(e) => setTemplate(e.target.value)}>
          <option value="prepost">Parole a inizio e fine blocco (confronto prima/dopo)</option>
          <option value="words">Una domanda a parole per blocco</option>
          <option value="empty">Nessuna: aggiungo io le domande</option>
        </select>
      </label>
      <p className="tiny muted">
        È solo un punto di partenza: dopo, in Impostazioni, puoi aggiungere, togliere e cambiare tipo a ogni domanda
        (parole, scelta multipla, scala, risposta aperta, quiz).
      </p>
      {err && <div className="alert error">{err}</div>}
      <div>
        <button className="btn primary" disabled={busy || !title.trim()}>
          Crea evento
        </button>
      </div>
    </form>
  );
}
