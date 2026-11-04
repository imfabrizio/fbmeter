"use client";

import { useEffect, useState } from "react";
import { postJson } from "@/components/usePolling";
import type { ProviderInfo } from "@/lib/ai";

interface Profile {
  id: string;
  label: string;
  provider: string;
  model: string;
  keyHint: string;
  isDefault: boolean;
  lastTestOk: boolean | null;
  lastTestAt: string | null;
}

type Msg = { kind: "ok" | "error"; text: string } | null;

export function AiProfiles({ providers }: { providers: ProviderInfo[] }) {
  const [list, setList] = useState<Profile[] | null>(null);
  const [editing, setEditing] = useState<string | "new" | null>(null);

  async function load() {
    const r = await fetch("/api/admin/ai-profiles", { cache: "no-store" });
    const l = (await r.json()) as Profile[];
    setList(l);
    return l;
  }
  useEffect(() => {
    void load().then((l) => l.length === 0 && setEditing("new"));
  }, []);

  if (!list) return <p className="muted">Caricamento…</p>;

  return (
    <div className="stack">
      {list.length === 0 && editing !== "new" && (
        <div className="alert warn">Nessun profilo AI: le unioni restano manuali e la convergenza non genera i temi.</div>
      )}
      {list.map((p) =>
        editing === p.id ? (
          <ProfileForm key={p.id} providers={providers} profile={p} onDone={async () => { setEditing(null); await load(); }} />
        ) : (
          <ProfileCard key={p.id} p={p} providers={providers} onEdit={() => setEditing(p.id)} reload={load} />
        ),
      )}
      {editing === "new" ? (
        <ProfileForm providers={providers} first={list.length === 0} onDone={async () => { setEditing(null); await load(); }} onCancel={list.length ? () => setEditing(null) : undefined} />
      ) : (
        <button className="btn" onClick={() => setEditing("new")} disabled={editing !== null} style={{ alignSelf: "flex-start" }}>
          + Aggiungi un profilo AI
        </button>
      )}
    </div>
  );
}

function ProfileCard({ p, providers, onEdit, reload }: { p: Profile; providers: ProviderInfo[]; onEdit: () => void; reload: () => Promise<unknown> }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const prov = providers.find((x) => x.id === p.provider);

  async function run(fn: () => Promise<unknown>, ok?: (r: unknown) => string) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fn();
      if (ok) setMsg({ kind: "ok", text: ok(r) });
      await reload();
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : "Errore" });
      await reload();
    } finally {
      setBusy(false);
    }
  }

  const status =
    p.lastTestOk === true ? <span className="pill ok">✓ funziona</span> : p.lastTestOk === false ? <span className="pill bad">✗ ultimo test fallito</span> : <span className="pill">non provato</span>;

  return (
    <div className={`card ai-card ${p.isDefault ? "default" : ""}`}>
      <div className="spread" style={{ alignItems: "flex-start", gap: 12 }}>
        <div>
          <div className="row" style={{ gap: 8 }}>
            <b style={{ fontSize: "1.05rem" }}>{p.label}</b>
            {p.isDefault && <span className="pill accent">Predefinito</span>}
            {status}
          </div>
          <div className="small muted" style={{ marginTop: 4 }}>
            {prov?.label ?? p.provider} · <code>{p.model}</code> · chiave <code>{p.keyHint}</code>
          </div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          {!p.isDefault && (
            <button className="btn sm primary" disabled={busy} onClick={() => run(() => postJson(`/api/admin/ai-profiles/${p.id}/default`))}>
              Rendi predefinito
            </button>
          )}
          <button
            className="btn sm"
            disabled={busy}
            onClick={() => run(() => postJson<{ ms: number }>(`/api/admin/ai-profiles/${p.id}/test`), (r) => `Funziona: risposta in ${((r as { ms: number }).ms / 1000).toFixed(1)} s.`)}
          >
            {busy ? "…" : "Prova"}
          </button>
          <button className="btn sm" disabled={busy} onClick={onEdit}>
            Modifica
          </button>
          <button
            className="btn sm ghost danger"
            disabled={busy}
            onClick={() => confirm(`Eliminare il profilo "${p.label}"?`) && run(() => postJson(`/api/admin/ai-profiles/${p.id}`, undefined, "DELETE"))}
          >
            Elimina
          </button>
        </div>
      </div>
      {msg && <div className={`alert ${msg.kind}`} style={{ marginTop: 10 }}>{msg.text}</div>}
    </div>
  );
}

function ProfileForm({
  providers,
  profile,
  first,
  onDone,
  onCancel,
}: {
  providers: ProviderInfo[];
  profile?: Profile;
  first?: boolean;
  onDone: () => Promise<void>;
  onCancel?: () => void;
}) {
  const [provider, setProvider] = useState(profile?.provider ?? providers[0].id);
  const prov = providers.find((p) => p.id === provider)!;
  const [model, setModel] = useState(profile?.model ?? prov.defaultModel);
  const [label, setLabel] = useState(profile?.label ?? "");
  const [apiKey, setApiKey] = useState("");
  const [makeDefault, setMakeDefault] = useState(false);
  const [test, setTest] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const keepKey = !!profile && profile.provider === provider;
  const known = prov.models.some((m) => m.id === model);
  const [custom, setCustom] = useState(!!profile && !providers.find((p) => p.id === profile.provider)?.models.some((m) => m.id === profile.model));

  function changeProvider(id: string) {
    setProvider(id);
    const np = providers.find((p) => p.id === id)!;
    setModel(np.defaultModel);
    setCustom(false);
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      let id = profile?.id;
      if (profile) {
        await postJson(`/api/admin/ai-profiles/${profile.id}`, { label, provider, model, apiKey }, "PATCH");
      } else {
        const r = await postJson<{ id: string }>("/api/admin/ai-profiles", { label, provider, model, apiKey, isDefault: makeDefault });
        id = r.id;
      }
      if (test && id && (apiKey || !profile || model !== profile.model)) {
        try {
          await postJson(`/api/admin/ai-profiles/${id}/test`);
        } catch (e) {
          setMsg({ kind: "error", text: `Salvato, ma la prova non è riuscita: ${e instanceof Error ? e.message : "errore"}` });
          setBusy(false);
          setTimeout(() => void onDone(), 2500);
          return;
        }
      }
      await onDone();
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : "Errore" });
      setBusy(false);
    }
  }

  return (
    <div className="card stack">
      <h3 style={{ margin: 0 }}>{profile ? `Modifica "${profile.label}"` : first ? "Il tuo primo profilo AI" : "Nuovo profilo AI"}</h3>
      <div className="grid2">
        <label className="field">
          <span>Fornitore</span>
          <select value={provider} onChange={(e) => changeProvider(e.target.value)}>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Modello</span>
          {custom ? (
            <input type="text" value={model} onChange={(e) => setModel(e.target.value)} placeholder={prov.defaultModel} />
          ) : (
            <select
              value={known ? model : prov.defaultModel}
              onChange={(e) => (e.target.value === "__custom" ? setCustom(true) : setModel(e.target.value))}
            >
              {prov.models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id} — {m.note}
                </option>
              ))}
              <option value="__custom">Altro modello…</option>
            </select>
          )}
        </label>
      </div>
      <label className="field">
        <span>Nome del profilo (facoltativo)</span>
        <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={`${prov.short} · ${model || prov.defaultModel}`} maxLength={60} />
      </label>
      <label className="field">
        <span>
          Chiave API {keepKey && "(lascia vuoto per mantenere quella salvata)"} ·{" "}
          <a href={prov.keyUrl} target="_blank" rel="noreferrer">
            dove la trovo ↗
          </a>
        </span>
        <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="off" placeholder={`${prov.keyPrefix}…`} />
      </label>
      {apiKey && !apiKey.trim().startsWith(prov.keyPrefix) && (
        <div className="alert warn small">
          Le chiavi {prov.short} di solito iniziano con <code>{prov.keyPrefix}</code>: controlla di aver scelto il fornitore giusto.
        </div>
      )}
      <div className="row" style={{ gap: 16 }}>
        {!profile && !first && (
          <label className="row small" style={{ gap: 6 }}>
            <input type="checkbox" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} style={{ width: 16, height: 16 }} />
            Rendilo predefinito
          </label>
        )}
        <label className="row small" style={{ gap: 6 }}>
          <input type="checkbox" checked={test} onChange={(e) => setTest(e.target.checked)} style={{ width: 16, height: 16 }} />
          Prova subito la chiave
        </label>
      </div>
      {msg && <div className={`alert ${msg.kind}`}>{msg.text}</div>}
      <div className="row">
        <button className="btn primary" disabled={busy || (!keepKey && apiKey.trim().length < 20)} onClick={save}>
          {busy ? "Salvataggio…" : "Salva"}
        </button>
        {(onCancel || profile) && (
          <button className="btn ghost" disabled={busy} onClick={onCancel ?? (() => void onDone())}>
            Annulla
          </button>
        )}
      </div>
    </div>
  );
}
