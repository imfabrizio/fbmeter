"use client";

import { useEffect, useState } from "react";
import { postJson } from "@/components/usePolling";

interface Saved {
  provider: string;
  model: string;
  keyHint: string;
  updatedAt: string;
}

export function AiSettingsForm({ providers }: { providers: { id: string; label: string; defaultModel: string }[] }) {
  const [saved, setSaved] = useState<Saved | null>(null);
  const [provider, setProvider] = useState(providers[0].id);
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function load() {
    const r = await fetch("/api/admin/ai-settings", { cache: "no-store" });
    const s = (await r.json()) as Saved | null;
    setSaved(s);
    if (s) {
      setProvider(s.provider);
      setModel(s.model);
    }
  }
  useEffect(() => {
    void load();
  }, []);

  const current = providers.find((p) => p.id === provider)!;

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ kind: "ok", text: ok });
      setApiKey("");
      await load();
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : "Errore" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card stack">
      {saved ? (
        <div className="alert ok">
          Configurata: <b>{providers.find((p) => p.id === saved.provider)?.label}</b> · modello <code>{saved.model}</code> · chiave{" "}
          <code>{saved.keyHint}</code>
        </div>
      ) : (
        <div className="alert warn">Nessuna chiave configurata: le unioni restano manuali.</div>
      )}
      <label className="field">
        <span>Fornitore</span>
        <select value={provider} onChange={(e) => setProvider(e.target.value)}>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Modello</span>
        <input type="text" value={model} onChange={(e) => setModel(e.target.value)} placeholder={current.defaultModel} />
      </label>
      <label className="field">
        <span>Chiave API {saved && saved.provider === provider && "(lascia vuoto per mantenere quella salvata)"}</span>
        <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="off" placeholder="sk-…" />
      </label>
      {msg && <div className={`alert ${msg.kind}`}>{msg.text}</div>}
      <div className="row">
        <button
          className="btn primary"
          disabled={busy}
          onClick={() => run(() => postJson("/api/admin/ai-settings", { provider, model, apiKey }, "PUT"), "Salvato.")}
        >
          Salva
        </button>
        {saved && (
          <>
            <button className="btn" disabled={busy} onClick={() => run(() => postJson("/api/admin/ai-settings/test"), "La chiave funziona.")}>
              Prova la chiave
            </button>
            <button
              className="btn danger"
              disabled={busy}
              onClick={() => confirm("Eliminare la chiave salvata?") && run(() => postJson("/api/admin/ai-settings", undefined, "DELETE"), "Chiave eliminata.")}
            >
              Elimina
            </button>
          </>
        )}
      </div>
    </div>
  );
}
