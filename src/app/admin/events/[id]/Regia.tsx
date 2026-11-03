"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { postJson, usePolling } from "@/components/usePolling";

interface Q {
  id: string;
  prompt: string;
  maxWords: number;
  respondents: number;
  top: { label: string; count: number }[];
}
interface Block {
  id: string;
  title: string;
  position: number;
  pre: Q;
  post: Q;
}
interface QaItem {
  id: string;
  text: string;
  status: string;
  votes: number;
  nickname: string;
  createdAt: string;
}
interface EventState {
  me: { role: string };
  event: {
    id: string;
    code: string;
    title: string;
    activeQuestionId: string | null;
    screenMode: string;
    screenBlockId: string | null;
    qaEnabled: boolean;
    qaModerated: boolean;
    resultsPublished: boolean;
  };
  joinUrl: string;
  participants: number;
  blocks: Block[];
  qa: QaItem[];
}

type Tab = "live" | "words" | "qa" | "settings";

export function Regia({ id }: { id: string }) {
  const { data, error, refresh } = usePolling<EventState>(`/api/admin/events/${id}`, 2500);
  const [tab, setTab] = useState<Tab>("live");

  if (!data) return <main className="container">{error ? <div className="alert error">{error}</div> : <p className="muted">Caricamento…</p>}</main>;
  const ev = data.event;
  const pendingQa = data.qa.filter((q) => q.status === "pending").length;

  return (
    <main className="container stack">
      <div className="spread">
        <div>
          <div className="row">
            <span className="badge accent">{ev.code}</span>
            <span className="small muted">{data.participants} partecipanti collegati</span>
          </div>
          <h1 style={{ marginTop: 6 }}>{ev.title}</h1>
        </div>
        <div className="row">
          <a className="btn" href={`/present/${ev.code}`} target="_blank" rel="noreferrer">
            Schermo proiettore ↗
          </a>
          <a className="btn" href={`/e/${ev.code}`} target="_blank" rel="noreferrer">
            Vista pubblico ↗
          </a>
          <a className="btn" href={`/r/${ev.code}`} target="_blank" rel="noreferrer">
            Risultati ↗
          </a>
        </div>
      </div>
      {error && <div className="alert warn">{error}</div>}

      <div className="tabs">
        <button className={tab === "live" ? "active" : ""} onClick={() => setTab("live")}>
          Conduzione
        </button>
        <button className={tab === "words" ? "active" : ""} onClick={() => setTab("words")}>
          Parole e unioni
        </button>
        {ev.qaEnabled && (
          <button className={tab === "qa" ? "active" : ""} onClick={() => setTab("qa")}>
            Domande {pendingQa > 0 && <span className="badge warn">{pendingQa}</span>}
          </button>
        )}
        <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}>
          Impostazioni
        </button>
      </div>

      {tab === "live" && <LiveTab data={data} refresh={refresh} />}
      {tab === "words" && <WordsTab eventId={ev.id} blocks={data.blocks} />}
      {tab === "qa" && ev.qaEnabled && <QaTab eventId={ev.id} items={data.qa} refresh={refresh} />}
      {tab === "settings" && <SettingsTab data={data} refresh={refresh} />}
    </main>
  );
}

/* ------------------------------------------------------------------ */

function LiveTab({ data, refresh }: { data: EventState; refresh: () => Promise<void> }) {
  const ev = data.event;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [compareBlock, setCompareBlock] = useState<string>(ev.screenBlockId ?? data.blocks[0]?.id ?? "");

  async function control(body: Record<string, unknown>) {
    setBusy(true);
    setErr(null);
    try {
      await postJson(`/api/admin/events/${ev.id}/control`, body);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Errore");
    } finally {
      setBusy(false);
    }
  }

  const activeBlock = data.blocks.find((b) => b.pre.id === ev.activeQuestionId || b.post.id === ev.activeQuestionId);
  const activePhase = activeBlock ? (activeBlock.pre.id === ev.activeQuestionId ? "inizio" : "fine") : null;

  // suggerimento del passo successivo: ordine blocco1-inizio, blocco1-fine, blocco2-inizio, …
  const sequence = data.blocks.flatMap((b) => [
    { q: b.pre, label: `${b.title} · inizio` },
    { q: b.post, label: `${b.title} · fine` },
  ]);
  const idx = sequence.findIndex((s) => s.q.id === ev.activeQuestionId);
  const next = idx >= 0 ? sequence[idx + 1] : sequence.find((s) => s.q.respondents === 0);

  const modes: { id: string; label: string }[] = [
    { id: "live", label: "Nuvola live" },
    { id: "join", label: "QR grande" },
    { id: "compare", label: "Confronto prima/dopo" },
    { id: "final", label: "Riepilogo finale" },
    ...(ev.qaEnabled ? [{ id: "qa", label: "Domande" }] : []),
  ];

  return (
    <div className="stack">
      <div className="card spread">
        <div className="row" style={{ gap: 16 }}>
          <div className="qr-box">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/p/${ev.code}/qr`} alt="QR code evento" width={96} height={96} />
          </div>
          <div>
            <div className="small muted">Link unico per il pubblico (sempre lo stesso)</div>
            <div>
              <code>{data.joinUrl}</code>
            </div>
            <a className="small" href={`/api/p/${ev.code}/qr?download=1`}>
              Scarica QR (SVG) per le slide
            </a>
          </div>
        </div>
        <div className="stack" style={{ minWidth: 240 }}>
          {activeBlock ? (
            <div className="alert ok">
              Aperta: <b>{activeBlock.title}</b> · {activePhase}
            </div>
          ) : (
            <div className="alert warn">Nessuna domanda aperta: il pubblico è in attesa.</div>
          )}
          <div className="row">
            {next && (
              <button className="btn primary" disabled={busy} onClick={() => control({ activeQuestionId: next.q.id })}>
                Apri: {next.label} →
              </button>
            )}
            {activeBlock && (
              <button className="btn" disabled={busy} onClick={() => control({ activeQuestionId: null })}>
                Chiudi
              </button>
            )}
          </div>
        </div>
      </div>
      {err && <div className="alert error">{err}</div>}

      <div className="stack" style={{ gap: 8 }}>
        {data.blocks.map((b, i) => {
          const current = b.pre.id === ev.activeQuestionId || b.post.id === ev.activeQuestionId;
          return (
            <div key={b.id} className={`block-row ${current ? "current" : ""}`}>
              <div className="block-num">{i + 1}</div>
              <div>
                <b>{b.title}</b>
                <div className="tiny muted">
                  {b.pre.top.length > 0 && <>Prima: {b.pre.top.map((w) => w.label).join(", ")}</>}
                  {b.pre.top.length > 0 && b.post.top.length > 0 && " · "}
                  {b.post.top.length > 0 && <>Dopo: {b.post.top.map((w) => w.label).join(", ")}</>}
                </div>
              </div>
              <div className="phase-btns">
                {(["pre", "post"] as const).map((ph) => {
                  const q = b[ph];
                  const on = q.id === ev.activeQuestionId;
                  return (
                    <button
                      key={ph}
                      className={`btn phase-btn ${on ? "on" : ""}`}
                      disabled={busy || on}
                      onClick={() => control({ activeQuestionId: q.id })}
                      title={q.prompt}
                    >
                      {ph === "pre" ? "Inizio" : "Fine"}
                      <small>{on ? "aperta · " : ""}{q.respondents} risposte</small>
                    </button>
                  );
                })}
                <button
                  className="btn sm ghost"
                  disabled={busy}
                  onClick={() => control({ screenMode: "compare", screenBlockId: b.id })}
                  title="Mostra sul proiettore il confronto prima/dopo di questo blocco"
                >
                  Confronta
                </button>
              </div>
            </div>
          );
        })}
        {data.blocks.length === 0 && <p className="muted">Nessun blocco: aggiungili in Impostazioni.</p>}
      </div>

      <div className="card stack">
        <h2>Schermo del proiettore</h2>
        <div className="row">
          {modes.map((m) => (
            <button
              key={m.id}
              className={`btn sm ${ev.screenMode === m.id ? "on" : ""}`}
              disabled={busy}
              onClick={() =>
                control(m.id === "compare" ? { screenMode: "compare", screenBlockId: compareBlock } : { screenMode: m.id })
              }
            >
              {m.label}
            </button>
          ))}
        </div>
        <label className="field" style={{ maxWidth: 320 }}>
          <span>Blocco da confrontare</span>
          <select
            value={compareBlock}
            onChange={(e) => {
              setCompareBlock(e.target.value);
              if (ev.screenMode === "compare") void control({ screenMode: "compare", screenBlockId: e.target.value });
            }}
          >
            {data.blocks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title}
              </option>
            ))}
          </select>
        </label>
        <p className="tiny muted">
          Aprendo una domanda lo schermo torna da solo sulla nuvola live. Apri lo schermo proiettore in una finestra a parte e
          mettila a tutto schermo (F11).
        </p>
      </div>

      <div className="card spread">
        <div>
          <b>Risultati pubblici</b>
          <div className="small muted">
            {ev.resultsPublished
              ? "Pubblicati: il pubblico vede il pulsante Risultati sul telefono."
              : "Non ancora pubblicati: solo gli operatori vedono la pagina risultati."}
          </div>
        </div>
        <button
          className={`btn ${ev.resultsPublished ? "" : "primary"}`}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await postJson(`/api/admin/events/${ev.id}`, { resultsPublished: !ev.resultsPublished }, "PATCH");
              await refresh();
            } finally {
              setBusy(false);
            }
          }}
        >
          {ev.resultsPublished ? "Ritira i risultati" : "Pubblica i risultati"}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

interface WordRow {
  key: string;
  label: string;
  pre: number;
  post: number;
  forms: string[];
}
interface WordsData {
  block: { id: string; title: string };
  respondents: { pre: number; post: number };
  words: WordRow[];
  aliases: { sourceKey: string; targetLabel: string }[];
}
interface AiGroup {
  label: string;
  members: { label: string; key: string; count: number }[];
  selected?: boolean;
}

function WordsTab({ eventId, blocks }: { eventId: string; blocks: Block[] }) {
  const [blockId, setBlockId] = useState(blocks[0]?.id ?? "");
  const { data, error, refresh } = usePolling<WordsData>(
    blockId ? `/api/admin/events/${eventId}/blocks/${blockId}/words` : null,
    5000,
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [ai, setAi] = useState<AiGroup[] | null>(null);

  useEffect(() => {
    setSelected(new Set());
    setAi(null);
    setMsg(null);
  }, [blockId]);

  const selectedRows = useMemo(() => (data?.words ?? []).filter((w) => selected.has(w.key)), [data, selected]);
  useEffect(() => {
    if (selectedRows.length) {
      const best = [...selectedRows].sort((a, b) => b.pre + b.post - (a.pre + a.post))[0];
      setLabel(best.label);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const groups = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const a of data?.aliases ?? []) m.set(a.targetLabel, [...(m.get(a.targetLabel) ?? []), a.sourceKey]);
    return [...m.entries()];
  }, [data]);

  const base = `/api/admin/events/${eventId}/blocks/${blockId}`;

  async function run(fn: () => Promise<unknown>, ok?: string) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      if (ok) setMsg({ kind: "ok", text: ok });
      await refresh();
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : "Errore" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="row">
        <select value={blockId} onChange={(e) => setBlockId(e.target.value)} style={{ maxWidth: 320 }} aria-label="Blocco">
          {blocks.map((b, i) => (
            <option key={b.id} value={b.id}>
              {i + 1}. {b.title}
            </option>
          ))}
        </select>
        <button
          className="btn"
          disabled={busy || !data || data.words.length < 2}
          onClick={() =>
            run(async () => {
              const r = await postJson<{ groups: AiGroup[] }>(`${base}/ai-suggest`);
              setAi(r.groups.map((g) => ({ ...g, selected: true })));
              if (!r.groups.length) setMsg({ kind: "ok", text: "L'AI non ha trovato voci da unire." });
            })
          }
        >
          ✨ Suggerisci unioni con l&apos;AI
        </button>
      </div>
      <p className="small muted">
        Varianti come maiuscole, accenti e singolare/plurale sono già unite in automatico. Qui decidi tu le unioni di
        significato (es. “utenti” in “identità”): valgono per inizio e fine del blocco e si possono sciogliere in qualsiasi
        momento.
      </p>
      {error && <div className="alert warn">{error}</div>}
      {msg && <div className={`alert ${msg.kind}`}>{msg.text}</div>}

      {ai && ai.length > 0 && (
        <div className="card stack">
          <h3>Proposte dell&apos;AI</h3>
          {ai.map((g, i) => (
            <div key={i} className="row" style={{ alignItems: "flex-start" }}>
              <input
                type="checkbox"
                checked={!!g.selected}
                onChange={(e) => setAi((list) => list!.map((x, j) => (j === i ? { ...x, selected: e.target.checked } : x)))}
                aria-label={`Applica il gruppo ${g.label}`}
                style={{ width: 18, height: 18, marginTop: 10 }}
              />
              <input
                type="text"
                value={g.label}
                onChange={(e) => setAi((list) => list!.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                style={{ maxWidth: 220 }}
                aria-label="Etichetta del gruppo"
              />
              <span className="small" style={{ paddingTop: 10 }}>
                ← {g.members.map((m) => `${m.label} (${m.count})`).join(", ")}
              </span>
            </div>
          ))}
          <div className="row">
            <button
              className="btn primary"
              disabled={busy || !ai.some((g) => g.selected)}
              onClick={() =>
                run(async () => {
                  await postJson(`${base}/aliases`, {
                    groups: ai.filter((g) => g.selected).map((g) => ({ targetLabel: g.label, sourceKeys: g.members.map((m) => m.key) })),
                  });
                  setAi(null);
                }, "Unioni applicate.")
              }
            >
              Applica le selezionate
            </button>
            <button className="btn ghost" onClick={() => setAi(null)}>
              Scarta
            </button>
          </div>
        </div>
      )}

      {selectedRows.length >= 2 && (
        <div className="card row" style={{ position: "sticky", top: 8, zIndex: 2 }}>
          <span className="small">Unisci {selectedRows.length} voci come</span>
          <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} style={{ maxWidth: 220 }} aria-label="Etichetta" />
          <button
            className="btn primary"
            disabled={busy || !label.trim()}
            onClick={() =>
              run(async () => {
                await postJson(`${base}/aliases`, { targetLabel: label, sourceKeys: selectedRows.map((r) => r.key) });
                setSelected(new Set());
              }, `Unite in “${label}”.`)
            }
          >
            Unisci
          </button>
          <button className="btn ghost" onClick={() => setSelected(new Set())}>
            Annulla
          </button>
        </div>
      )}

      {groups.length > 0 && (
        <div className="card stack">
          <h3>Unioni attive</h3>
          {groups.map(([target, keys]) => (
            <div key={target} className="spread">
              <span className="small">
                <b>{target}</b> ← {keys.join(", ")}
              </span>
              <button
                className="btn sm"
                disabled={busy}
                onClick={() => run(() => postJson(`${base}/aliases?targetLabel=${encodeURIComponent(target)}`, undefined, "DELETE"))}
              >
                Sciogli
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="card" style={{ overflowX: "auto" }}>
        {data && (
          <p className="small muted">
            Risposte: {data.respondents.pre} all&apos;inizio, {data.respondents.post} alla fine · {data.words.length} voci
          </p>
        )}
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 32 }} />
              <th>Voce</th>
              <th className="num">Prima</th>
              <th className="num">Dopo</th>
            </tr>
          </thead>
          <tbody>
            {(data?.words ?? []).map((w) => (
              <tr key={w.key}>
                <td>
                  <input
                    type="checkbox"
                    checked={selected.has(w.key)}
                    onChange={(e) =>
                      setSelected((s) => {
                        const n = new Set(s);
                        if (e.target.checked) n.add(w.key);
                        else n.delete(w.key);
                        return n;
                      })
                    }
                    aria-label={`Seleziona ${w.label}`}
                  />
                </td>
                <td>
                  <b>{w.label}</b>
                  {w.forms.length > 1 && <div className="tiny muted">{w.forms.join(" · ")}</div>}
                </td>
                <td className="num">{w.pre || ""}</td>
                <td className="num">{w.post || ""}</td>
              </tr>
            ))}
            {data && data.words.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
                  Ancora nessuna parola per questo blocco.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function QaTab({ eventId, items, refresh }: { eventId: string; items: QaItem[]; refresh: () => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null);
  async function set(id: string, status: string) {
    setBusy(id);
    try {
      await postJson(`/api/admin/events/${eventId}/qa/${id}`, { status }, "PATCH");
      await refresh();
    } finally {
      setBusy(null);
    }
  }
  const label: Record<string, string> = { pending: "da approvare", visible: "visibile", answered: "risposta data", hidden: "nascosta" };
  const cls: Record<string, string> = { pending: "warn", visible: "accent", answered: "live", hidden: "" };

  return (
    <div className="card">
      {items.length === 0 && <p className="muted">Nessuna domanda dal pubblico.</p>}
      {items.map((q) => (
        <div key={q.id} className="qa-item" style={{ opacity: q.status === "hidden" ? 0.55 : 1 }}>
          <div>
            <div>{q.text}</div>
            <div className="tiny muted">
              {q.nickname} · ▲ {q.votes} · <span className={`badge ${cls[q.status]}`}>{label[q.status]}</span>
            </div>
          </div>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            {q.status === "pending" && (
              <button className="btn sm primary" disabled={busy === q.id} onClick={() => set(q.id, "visible")}>
                Approva
              </button>
            )}
            {q.status === "visible" && (
              <button className="btn sm" disabled={busy === q.id} onClick={() => set(q.id, "answered")}>
                Risposta data
              </button>
            )}
            {q.status !== "hidden" ? (
              <button className="btn sm danger" disabled={busy === q.id} onClick={() => set(q.id, "hidden")}>
                Nascondi
              </button>
            ) : (
              <button className="btn sm" disabled={busy === q.id} onClick={() => set(q.id, "visible")}>
                Ripristina
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */

interface EditBlock {
  id?: string;
  title: string;
  prePrompt: string;
  postPrompt: string;
  maxWords: number;
  respondents: number;
}

function SettingsTab({ data, refresh }: { data: EventState; refresh: () => Promise<void> }) {
  const router = useRouter();
  const ev = data.event;
  const [title, setTitle] = useState(ev.title);
  const [qaEnabled, setQaEnabled] = useState(ev.qaEnabled);
  const [qaModerated, setQaModerated] = useState(ev.qaModerated);
  const [blocks, setBlocks] = useState<EditBlock[]>(() =>
    data.blocks.map((b) => ({
      id: b.id,
      title: b.title,
      prePrompt: b.pre.prompt,
      postPrompt: b.post.prompt,
      maxWords: b.pre.maxWords,
      respondents: b.pre.respondents + b.post.respondents,
    })),
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [resetCode, setResetCode] = useState("");
  const [resetAliases, setResetAliases] = useState(false);

  const update = (i: number, patch: Partial<EditBlock>) => setBlocks((bs) => bs.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  const move = (i: number, d: number) =>
    setBlocks((bs) => {
      const n = [...bs];
      const j = i + d;
      if (j < 0 || j >= n.length) return bs;
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });

  async function save() {
    const removed = data.blocks.filter((b) => !blocks.some((x) => x.id === b.id));
    const lost = removed.reduce((s, b) => s + b.pre.respondents + b.post.respondents, 0);
    if (lost > 0 && !confirm(`Stai eliminando blocchi con ${lost} risposte: verranno cancellate. Continuare?`)) return;
    setBusy(true);
    setMsg(null);
    try {
      await postJson(`/api/admin/events/${ev.id}`, { title, qaEnabled, qaModerated, blocks }, "PATCH");
      await refresh();
      setMsg({ kind: "ok", text: "Salvato." });
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : "Errore" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="card stack">
        <h2>Evento</h2>
        <label className="field">
          <span>Titolo</span>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="check">
          <input type="checkbox" checked={qaEnabled} onChange={(e) => setQaEnabled(e.target.checked)} />
          <span>
            <b>Domande dal pubblico (Q&amp;A)</b>
            <br />
            <span className="small muted">Se spento, il Q&amp;A non compare da nessuna parte: né sul telefono né in regia.</span>
          </span>
        </label>
        {qaEnabled && (
          <label className="check">
            <input type="checkbox" checked={qaModerated} onChange={(e) => setQaModerated(e.target.checked)} />
            <span>
              <b>Approva le domande prima di mostrarle</b>
              <br />
              <span className="small muted">Le nuove domande restano visibili solo all&apos;autore finché non le approvi.</span>
            </span>
          </label>
        )}
      </div>

      <div className="card stack">
        <h2>Blocchi</h2>
        {blocks.map((b, i) => (
          <div key={b.id ?? `new-${i}`} className="stack" style={{ borderTop: i ? "1px solid var(--border)" : 0, paddingTop: i ? 16 : 0 }}>
            <div className="row">
              <span className="block-num">{i + 1}</span>
              <input type="text" value={b.title} onChange={(e) => update(i, { title: e.target.value })} style={{ flex: 1, width: "auto" }} aria-label="Titolo blocco" />
              <button className="btn sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Sposta su">
                ↑
              </button>
              <button className="btn sm" onClick={() => move(i, 1)} disabled={i === blocks.length - 1} aria-label="Sposta giù">
                ↓
              </button>
              <button className="btn sm danger" onClick={() => setBlocks((bs) => bs.filter((_, j) => j !== i))}>
                Rimuovi{b.respondents ? ` (${b.respondents} risposte)` : ""}
              </button>
            </div>
            <label className="field">
              <span>Domanda di inizio</span>
              <input type="text" value={b.prePrompt} onChange={(e) => update(i, { prePrompt: e.target.value })} placeholder="Lascia vuoto per il testo predefinito" />
            </label>
            <label className="field">
              <span>Domanda di fine</span>
              <input type="text" value={b.postPrompt} onChange={(e) => update(i, { postPrompt: e.target.value })} placeholder="Lascia vuoto per il testo predefinito" />
            </label>
            <label className="field" style={{ maxWidth: 200 }}>
              <span>Parole per persona</span>
              <input type="number" min={1} max={10} value={b.maxWords} onChange={(e) => update(i, { maxWords: Number(e.target.value) })} />
            </label>
          </div>
        ))}
        <div>
          <button
            className="btn"
            onClick={() => setBlocks((bs) => [...bs, { title: "Nuovo blocco", prePrompt: "", postPrompt: "", maxWords: 3, respondents: 0 }])}
          >
            + Aggiungi blocco
          </button>
        </div>
      </div>

      {msg && <div className={`alert ${msg.kind}`}>{msg.text}</div>}
      <div>
        <button className="btn primary" disabled={busy} onClick={save}>
          Salva impostazioni e blocchi
        </button>
      </div>

      <div className="card stack">
        <h2>Esporta</h2>
        <p className="small muted">CSV con separatore “;”, si apre direttamente in Excel.</p>
        <div className="row">
          <a className="btn" href={`/api/admin/events/${ev.id}/export?type=summary`}>
            Classifica per blocco
          </a>
          <a className="btn" href={`/api/admin/events/${ev.id}/export?type=raw`}>
            Tutte le risposte
          </a>
        </div>
      </div>

      <div className="card stack" style={{ borderColor: "var(--danger)" }}>
        <h2>Zona pericolosa</h2>
        <p className="small">
          <b>Azzera le prove</b>: cancella partecipanti, risposte e domande del pubblico. Blocchi e impostazioni restano. Utile
          dopo i test, prima dell&apos;evento vero.
        </p>
        <label className="check small">
          <input type="checkbox" checked={resetAliases} onChange={(e) => setResetAliases(e.target.checked)} />
          <span>Cancella anche le unioni di parole</span>
        </label>
        <div className="row">
          <input type="text" value={resetCode} onChange={(e) => setResetCode(e.target.value)} placeholder={`Scrivi ${ev.code} per confermare`} style={{ maxWidth: 240 }} />
          <button
            className="btn danger"
            disabled={busy || resetCode.toUpperCase() !== ev.code}
            onClick={async () => {
              setBusy(true);
              try {
                await postJson(`/api/admin/events/${ev.id}/reset`, { confirm: ev.code, aliases: resetAliases });
                setResetCode("");
                setMsg({ kind: "ok", text: "Evento azzerato." });
                await refresh();
              } catch (e) {
                setMsg({ kind: "error", text: e instanceof Error ? e.message : "Errore" });
              } finally {
                setBusy(false);
              }
            }}
          >
            Azzera
          </button>
        </div>
        <div>
          <button
            className="btn danger"
            disabled={busy}
            onClick={async () => {
              if (!confirm(`Eliminare definitivamente “${ev.title}” con tutte le risposte?`)) return;
              await postJson(`/api/admin/events/${ev.id}`, undefined, "DELETE");
              router.push("/admin");
            }}
          >
            Elimina evento
          </button>
        </div>
      </div>
    </div>
  );
}
