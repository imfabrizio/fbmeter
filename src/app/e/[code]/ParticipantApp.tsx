"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { postJson, usePolling } from "@/components/usePolling";

interface QaItem {
  id: string;
  text: string;
  status: string;
  votes: number;
  nickname: string;
  mine: boolean;
  voted: boolean;
}

interface State {
  event: { title: string; code: string; qaEnabled: boolean; resultsPublished: boolean };
  me: { nickname: string } | null;
  tokenRejected?: boolean;
  active: {
    id: string;
    phase: "pre" | "post";
    prompt: string;
    maxWords: number;
    blockTitle: string;
    blockIndex: number;
    blockCount: number;
    myWords: string[] | null;
  } | null;
  qa?: QaItem[];
}

const storageKey = (code: string) => `fbmeter:${code}`;

function readToken(code: string): string | null {
  try {
    return localStorage.getItem(storageKey(code));
  } catch {
    return null;
  }
}

export function ParticipantApp({ code }: { code: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<"poll" | "qa">("poll");

  useEffect(() => {
    setToken(readToken(code));
    setReady(true);
  }, [code]);

  const headers = useCallback((): RequestInit => (token ? { headers: { "x-participant-token": token } } : {}), [token]);
  // più rapido quando c'è una domanda aperta e non hai ancora risposto
  const { data, error, status, refresh } = usePolling<State>(ready ? `/api/p/${code}/state` : null, 2500, headers);

  // appena cambia il token (ingresso), aggiorna subito senza aspettare il prossimo giro
  useEffect(() => {
    if (ready) void refresh();
  }, [token, ready, refresh]);

  // token non più valido (es. evento azzerato): si torna al nickname
  useEffect(() => {
    if (data?.tokenRejected && token) {
      try {
        localStorage.removeItem(storageKey(code));
      } catch {}
      setToken(null);
    }
  }, [data, token, code]);

  if (status === 404) {
    return (
      <main className="narrow center">
        <h1>Evento non trovato</h1>
        <p className="muted">Controlla il codice o inquadra di nuovo il QR code.</p>
      </main>
    );
  }
  if (!ready || !data) {
    return (
      <main className="narrow center">
        <p className="muted">{error ?? "Caricamento…"}</p>
      </main>
    );
  }

  if (token && !data.me && !data.tokenRejected) {
    return (
      <main className="narrow center">
        <p className="muted">Collegamento…</p>
      </main>
    );
  }

  if (!token || !data.me) {
    return (
      <JoinForm
        code={code}
        title={data.event.title}
        onJoined={(t) => {
          try {
            localStorage.setItem(storageKey(code), t);
          } catch {}
          setToken(t);
        }}
      />
    );
  }

  return (
    <div className="p-shell">
      <header className="p-head">
        <div>
          <div style={{ fontWeight: 800 }}>{data.event.title}</div>
          <div className="tiny muted">
            Sei <b>{data.me.nickname}</b> · codice {data.event.code}
          </div>
        </div>
        {data.event.resultsPublished && (
          <a className="btn sm" href={`/r/${code}`}>
            Risultati
          </a>
        )}
      </header>
      {data.event.qaEnabled && (
        <div className="tabs" style={{ padding: "0 16px", marginBottom: 0 }}>
          <button className={tab === "poll" ? "active" : ""} onClick={() => setTab("poll")}>
            Sondaggio
          </button>
          <button className={tab === "qa" ? "active" : ""} onClick={() => setTab("qa")}>
            Domande {data.qa?.length ? `(${data.qa.length})` : ""}
          </button>
        </div>
      )}
      <main className="p-main">
        {error && <div className="alert warn" style={{ marginBottom: 12 }}>{error}</div>}
        {tab === "qa" && data.event.qaEnabled ? (
          <QaPanel code={code} token={token} items={data.qa ?? []} onChange={refresh} />
        ) : (
          <PollPanel code={code} token={token} state={data} onChange={refresh} />
        )}
      </main>
    </div>
  );
}

function JoinForm({ code, title, onJoined }: { code: string; title: string; onJoined: (t: string) => void }) {
  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await postJson<{ token: string }>(`/api/p/${code}/join`, { nickname });
      onJoined(r.token);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Errore");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="narrow">
      <form className="card stack" onSubmit={submit}>
        <div>
          <div className="tiny muted">Benvenuto a</div>
          <h1 style={{ marginTop: 4 }}>{title}</h1>
        </div>
        <label className="field">
          <span>Scegli un nickname</span>
          <input
            type="text"
            autoFocus
            maxLength={30}
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="Anche inventato: resti anonimo"
            autoComplete="nickname"
          />
        </label>
        {err && <div className="alert error">{err}</div>}
        <button className="btn primary block" disabled={busy || nickname.trim().length < 2}>
          Entra
        </button>
        <p className="tiny muted">
          Non serve riscansionare il QR: questa pagina si aggiorna da sola a ogni nuova domanda. Se la chiudi, riaprendola
          rientri con lo stesso nickname.
        </p>
        <p className="tiny muted">
          Partecipando accetti i <a href="/termini">termini</a>. <a href="/privacy">Come trattiamo i dati</a>.
        </p>
      </form>
    </main>
  );
}

function PollPanel({
  code,
  token,
  state,
  onChange,
}: {
  code: string;
  token: string;
  state: State;
  onChange: () => Promise<void>;
}) {
  const q = state.active;
  const [values, setValues] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // nuova domanda → campi vuoti
  const qid = q?.id ?? null;
  useEffect(() => {
    setValues(q ? Array.from({ length: q.maxWords }, (_, i) => q.myWords?.[i] ?? "") : []);
    setEditing(false);
    setErr(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qid]);

  const filled = useMemo(() => values.filter((v) => v.trim()).length, [values]);

  if (!q) {
    return (
      <div className="p-waiting">
        <span className="pulse" />
        <h2 style={{ marginTop: 16 }}>In attesa della prossima domanda</h2>
        <p className="muted">Tieni aperta questa pagina: comparirà qui appena i relatori la apriranno.</p>
      </div>
    );
  }

  const answered = q.myWords && !editing;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await postJson(`/api/p/${code}/answer`, { questionId: q!.id, words: values }, "POST", { "x-participant-token": token });
      setEditing(false);
      await onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Errore");
      await onChange();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="row">
        <span className="badge accent">
          {q.blockIndex}/{q.blockCount} · {q.blockTitle}
        </span>
        <span className="badge">{q.phase === "pre" ? "Prima" : "Dopo"}</span>
      </div>
      <div className="p-prompt">{q.prompt}</div>

      {answered ? (
        <div className="stack">
          <div className="alert ok">Risposta inviata. Grazie!</div>
          <div className="podium">
            {q.myWords!.map((w) => (
              <span key={w} className="pill">
                {w}
              </span>
            ))}
          </div>
          <p className="muted small">Aspetta la prossima domanda: comparirà qui da sola.</p>
          <button className="btn sm" onClick={() => setEditing(true)}>
            Modifica la risposta
          </button>
        </div>
      ) : (
        <form className="stack p-words" onSubmit={submit}>
          {values.map((v, i) => (
            <input
              key={i}
              type="text"
              value={v}
              maxLength={40}
              autoFocus={i === 0}
              enterKeyHint={i === values.length - 1 ? "send" : "next"}
              placeholder={`Parola ${i + 1}`}
              aria-label={`Parola ${i + 1}`}
              onChange={(e) => setValues((vs) => vs.map((x, j) => (j === i ? e.target.value : x)))}
            />
          ))}
          {err && <div className="alert error">{err}</div>}
          <button className="btn primary block" disabled={busy || filled === 0}>
            Invia {filled > 0 && filled < values.length ? `(${filled} di ${values.length})` : ""}
          </button>
          <p className="tiny muted">Una parola o una breve espressione per campo. Puoi inviarne anche meno di {values.length}.</p>
        </form>
      )}
    </div>
  );
}

function QaPanel({
  code,
  token,
  items,
  onChange,
}: {
  code: string;
  token: string;
  items: QaItem[];
  onChange: () => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const h = { "x-participant-token": token };

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const r = await postJson<{ moderated: boolean }>(`/api/p/${code}/qa`, { text }, "POST", h);
      setText("");
      setMsg({ kind: "ok", text: r.moderated ? "Inviata: comparirà dopo l'approvazione dei relatori." : "Domanda inviata." });
      await onChange();
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : "Errore" });
    } finally {
      setBusy(false);
    }
  }

  async function vote(id: string) {
    try {
      await postJson(`/api/p/${code}/qa/${id}/vote`, undefined, "POST", h);
      await onChange();
    } catch {}
  }

  return (
    <div className="stack">
      <form className="stack" onSubmit={send}>
        <textarea rows={3} maxLength={300} value={text} onChange={(e) => setText(e.target.value)} placeholder="Scrivi una domanda per i relatori" />
        {msg && <div className={`alert ${msg.kind}`}>{msg.text}</div>}
        <button className="btn primary block" disabled={busy || text.trim().length < 5}>
          Invia domanda
        </button>
      </form>
      <div>
        {items.length === 0 && <p className="muted center">Ancora nessuna domanda.</p>}
        {items.map((q) => (
          <div key={q.id} className="qa-item">
            <div>
              <div>{q.text}</div>
              <div className="tiny muted">
                {q.nickname}
                {q.mine && " (tu)"}
                {q.status === "answered" && <span className="badge live" style={{ marginLeft: 6 }}>risposta data</span>}
                {q.status === "pending" && <span className="badge warn" style={{ marginLeft: 6 }}>in approvazione</span>}
              </div>
            </div>
            <button
              className={`btn sm vote ${q.voted ? "voted" : ""}`}
              disabled={q.status !== "visible"}
              onClick={() => vote(q.id)}
              aria-label={q.voted ? "Togli il voto" : "Vota questa domanda"}
            >
              ▲<span>{q.votes}</span>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
