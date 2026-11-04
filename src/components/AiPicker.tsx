"use client";

import { useEffect, useState } from "react";
import { postJson } from "./usePolling";

interface P {
  id: string;
  label: string;
  model: string;
  isDefault: boolean;
  lastTestOk: boolean | null;
}

/** Selettore compatto del profilo AI predefinito, per la regia. */
export function AiPicker() {
  const [list, setList] = useState<P[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const r = await fetch("/api/admin/ai-profiles", { cache: "no-store" });
      if (r.ok) setList((await r.json()) as P[]);
    } catch {
      /* rete assente: riprova al prossimo cambio */
    }
  }
  useEffect(() => {
    void load();
  }, []);

  if (!list) return null;
  if (!list.length)
    return (
      <a className="ai-pick empty" href="/admin/settings">
        <span className="tiny muted">AI</span>
        <span className="small">Nessun profilo · configura ↗</span>
      </a>
    );
  const current = list.find((p) => p.isDefault) ?? list[0];
  return (
    <label className="ai-pick">
      <span className="tiny muted">
        AI in uso{list.length > 1 ? " · le altre fanno da riserva" : ""}
      </span>
      <select
        value={current.id}
        disabled={busy}
        onChange={async (e) => {
          setBusy(true);
          try {
            await postJson(`/api/admin/ai-profiles/${e.target.value}/default`);
            await load();
          } finally {
            setBusy(false);
          }
        }}
        aria-label="Profilo AI predefinito"
      >
        {list.map((p) => (
          <option key={p.id} value={p.id}>
            {p.lastTestOk === false ? "⚠ " : ""}
            {p.label}
          </option>
        ))}
      </select>
    </label>
  );
}
