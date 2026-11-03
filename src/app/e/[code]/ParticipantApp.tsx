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
  active: ActiveQuestion | null;
  qa?: QaItem[];
}

interface MyAnswer {
  words?: string[];
  choices?: number[];
  value?: number | null;
  text?: string | null;
}

interface ActiveQuestion {
  id: string;
  type: "words" | "choice" | "scale" | "open" | "quiz";
  label: string;
  prompt: string;
  maxWords: number;
  options: string[];
  multiple: boolean;
  scaleMin: number;
  scaleMax: number;
  scaleMinLabel: string;
  scaleMaxLabel: string;
  correct: number[] | null;
  blockTitle: string;
  blockIndex: number;
  blockCount: number;
  myAnswer: MyAnswer | null;
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
  const [words, setWords] = useState<string[]>([]);
  const [choices, setChoices] = useState<number[]>([]);
  const [value, setValue] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // nuova domanda → campi ripartono dalla risposta salvata (o vuoti)
  const qid = q?.id ?? null;
  useEffect(() => {
    const a = q?.myAnswer;
    setWords(q ? Array.from({ length: q.maxWords }, (_, i) => a?.words?.[i] ?? "") : []);
    setChoices(a?.choices ?? []);
    setValue(a?.value ?? null);
    setText(a?.text ?? "");
    setEditing(false);
    setErr(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qid]);

  const filled = useMemo(() => words.filter((v) => v.trim()).length, [words]);

  if (!q) {
    return (
      <div className="p-waiting">
        <span className="pulse" />
        <h2 style={{ marginTop: 16 }}>In attesa della prossima domanda</h2>
        <p className="muted">Tieni aperta questa pagina: comparirà qui appena i relatori la apriranno.</p>
      </div>
    );
  }

  const revealed = q.type === "quiz" && q.correct !== null;
  const answered = !!q.myAnswer && !editing;

  async function submit(body: Record<string, unknown>) {
    setBusy(true);
    setErr(null);
    try {
      await postJson(`/api/p/${code}/answer`, { questionId: q!.id, ...body }, "POST", { "x-participant-token": token });
      setEditing(false);
      await onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Errore");
      await onChange();
    } finally {
      setBusy(false);
    }
  }

  const header = (
    <>
      <div className="row">
        <span className="badge accent">
          {q.blockIndex}/{q.blockCount} · {q.blockTitle}
        </span>
        {q.label && <span className="badge">{q.label}</span>}
      </div>
      <div className="p-prompt">{q.prompt}</div>
    </>
  );

  // quiz con soluzione rivelata: mostra giusto/sbagliato
  if (revealed) {
    const mine = q.myAnswer?.choices ?? [];
    const right = mine.length > 0 && [...mine].sort().join() === [...q.correct!].sort().join();
    return (
      <div>
        {header}
        <div className="choice-list">
          {q.options.map((o, i) => (
            <div key={i} className={`btn choice-btn ${q.correct!.includes(i) ? "right" : mine.includes(i) ? "wrong" : ""}`}>
              {q.correct!.includes(i) ? "✓ " : mine.includes(i) ? "✗ " : ""}
              {o}
            </div>
          ))}
        </div>
        <div className={`alert ${right ? "ok" : mine.length ? "error" : "warn"}`} style={{ marginTop: 14 }}>
          {right ? "Risposta esatta!" : mine.length ? "Questa volta no." : "Non hai risposto a questa domanda."}
        </div>
      </div>
    );
  }

  if (answered) {
    const a = q.myAnswer!;
    return (
      <div className="stack">
        {header}
        <div className="alert ok">Risposta inviata. Grazie!</div>
        <div className="podium">
          {q.type === "words" && a.words?.map((w) => <span key={w} className="pill">{w}</span>)}
          {(q.type === "choice" || q.type === "quiz") &&
            a.choices?.map((c) => (
              <span key={c} className="pill">
                {q.options[c]}
              </span>
            ))}
          {q.type === "scale" && <span className="pill">{a.value}</span>}
          {q.type === "open" && <span className="pill">{a.text}</span>}
        </div>
        <p className="muted small">
          {q.type === "quiz" ? "La soluzione comparirà qui quando i relatori la riveleranno." : "Aspetta la prossima domanda: comparirà qui da sola."}
        </p>
        <button className="btn sm" onClick={() => setEditing(true)}>
          Modifica la risposta
        </button>
      </div>
    );
  }

  return (
    <div>
      {header}
      {q.type === "words" && (
        <form
          className="stack p-words"
          onSubmit={(e) => {
            e.preventDefault();
            void submit({ words });
          }}
        >
          {words.map((v, i) => (
            <input
              key={i}
              type="text"
              value={v}
              maxLength={40}
              autoFocus={i === 0}
              enterKeyHint={i === words.length - 1 ? "send" : "next"}
              placeholder={`Parola ${i + 1}`}
              aria-label={`Parola ${i + 1}`}
              onChange={(e) => setWords((vs) => vs.map((x, j) => (j === i ? e.target.value : x)))}
            />
          ))}
          {err && <div className="alert error">{err}</div>}
          <button className="btn primary block" disabled={busy || filled === 0}>
            Invia {filled > 0 && filled < words.length ? `(${filled} di ${words.length})` : ""}
          </button>
          <p className="tiny muted">Una parola o una breve espressione per campo. Puoi inviarne anche meno di {words.length}.</p>
        </form>
      )}

      {(q.type === "choice" || q.type === "quiz") && (
        <div className="stack">
          <div className="choice-list" role={q.multiple ? "group" : "radiogroup"}>
            {q.options.map((o, i) => {
              const sel = choices.includes(i);
              return (
                <button
                  key={i}
                  type="button"
                  className={`btn choice-btn ${sel ? "selected" : ""}`}
                  aria-pressed={sel}
                  disabled={busy}
                  onClick={() => {
                    if (q.multiple) setChoices((cs) => (sel ? cs.filter((x) => x !== i) : [...cs, i]));
                    else void submit({ choices: [i] });
                  }}
                >
                  {q.multiple && (sel ? "☑ " : "☐ ")}
                  {o}
                </button>
              );
            })}
          </div>
          {q.multiple && (
            <button className="btn primary block" disabled={busy || !choices.length} onClick={() => submit({ choices })}>
              Invia
            </button>
          )}
          <p className="tiny muted">{q.multiple ? "Puoi scegliere più risposte." : "Tocca una risposta per inviarla."}</p>
          {err && <div className="alert error">{err}</div>}
        </div>
      )}

      {q.type === "scale" && (
        <div className="stack">
          <div className="scale-btns">
            {Array.from({ length: q.scaleMax - q.scaleMin + 1 }, (_, i) => q.scaleMin + i).map((v) => (
              <button
                key={v}
                type="button"
                className={`btn ${value === v ? "selected" : ""}`}
                disabled={busy}
                onClick={() => {
                  setValue(v);
                  void submit({ value: v });
                }}
              >
                {v}
              </button>
            ))}
          </div>
          {(q.scaleMinLabel || q.scaleMaxLabel) && (
            <div className="spread tiny muted">
              <span>
                {q.scaleMin} = {q.scaleMinLabel}
              </span>
              <span>
                {q.scaleMax} = {q.scaleMaxLabel}
              </span>
            </div>
          )}
          {err && <div className="alert error">{err}</div>}
        </div>
      )}

      {q.type === "open" && (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            void submit({ text });
          }}
        >
          <textarea rows={4} maxLength={300} value={text} onChange={(e) => setText(e.target.value)} placeholder="Scrivi qui" autoFocus />
          {err && <div className="alert error">{err}</div>}
          <button className="btn primary block" disabled={busy || text.trim().length < 2}>
            Invia
          </button>
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
