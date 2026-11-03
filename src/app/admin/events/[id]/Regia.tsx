"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ThemesList, type CrownData } from "@/components/Finale";
import { postJson, usePolling } from "@/components/usePolling";
import { QTYPES, defaultQuestion, type QType } from "@/lib/questions";

interface Q {
  id: string;
  blockId: string;
  type: QType;
  label: string;
  prompt: string;
  maxWords: number;
  options: string[];
  multiple: boolean;
  correct: number[];
  scaleMin: number;
  scaleMax: number;
  scaleMinLabel: string;
  scaleMaxLabel: string;
  inSummary: boolean;
  revealed: boolean;
  respondents: number;
  headline: string;
}
interface Block {
  id: string;
  title: string;
  position: number;
  revealReady: boolean;
  revealAi: boolean;
  hasPair: boolean;
  questions: Q[];
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
    aiSummary: unknown;
    teaserBlockId: string | null;
  };
  joinUrl: string;
  participants: number;
  blocks: Block[];
  qa: QaItem[];
}

type Tab = "live" | "words" | "qa" | "settings";

/** Copia un testo negli appunti (es. il link del proiettore da aprire su un altro PC). */
function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="btn"
      title={text}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        } catch {
          prompt("Copia questo link:", text);
        }
      }}
    >
      {done ? "Copiato ✓" : label}
    </button>
  );
}

const SHORT: Record<string, string> = { words: "Parole", choice: "Scelta", scale: "Scala", open: "Aperta", quiz: "Quiz" };
const qName = (q: Pick<Q, "label" | "type">, i: number) => q.label || `${SHORT[q.type] ?? "Domanda"} ${i + 1}`;

export function Regia({ id }: { id: string }) {
  const { data, error, refresh } = usePolling<EventState>(`/api/admin/events/${id}`, 2500);
  const [tab, setTab] = useState<Tab>("live");

  if (!data) return <main className="container">{error ? <div className="alert error">{error}</div> : <p className="muted">Caricamento…</p>}</main>;
  const ev = data.event;
  const pendingQa = data.qa.filter((q) => q.status === "pending").length;
  const hasWords = data.blocks.some((b) => b.questions.some((q) => q.type === "words"));

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
          <CopyButton text={data.joinUrl.replace(/\/e\/([^/]+)$/, "/present/$1")} label="Copia link proiettore" />
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
        {hasWords && (
          <button className={tab === "words" ? "active" : ""} onClick={() => setTab("words")}>
            Parole e unioni
          </button>
        )}
        {ev.qaEnabled && (
          <button className={tab === "qa" ? "active" : ""} onClick={() => setTab("qa")}>
            Domande dal pubblico {pendingQa > 0 && <span className="badge warn">{pendingQa}</span>}
          </button>
        )}
        <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}>
          Impostazioni e domande
        </button>
      </div>

      {tab === "live" && <LiveTab data={data} refresh={refresh} />}
      {tab === "words" && hasWords && <WordsTab eventId={ev.id} blocks={data.blocks} />}
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

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Errore");
    } finally {
      setBusy(false);
    }
  }
  const control = (body: Record<string, unknown>) => run(() => postJson(`/api/admin/events/${ev.id}/control`, body));
  const reveal = (blockId: string, refreshReveal = false) =>
    run(() => postJson(`/api/admin/events/${ev.id}/blocks/${blockId}/reveal`, { show: true, refresh: refreshReveal }));

  // sequenza di conduzione: tutte le domande, blocco per blocco
  const sequence = data.blocks.flatMap((b) => b.questions.map((q, i) => ({ q, b, label: `${b.title} · ${qName(q, i)}` })));
  const idx = sequence.findIndex((s) => s.q.id === ev.activeQuestionId);
  const current = idx >= 0 ? sequence[idx] : null;
  const next = idx >= 0 ? sequence[idx + 1] : sequence.find((s) => s.q.respondents === 0);

  // blocco appena chiuso con il prima/dopo da rivelare
  const teaserBlock = data.blocks.find((b) => b.id === ev.teaserBlockId);
  const teaserShown = ev.screenMode === "reveal" && ev.screenBlockId === ev.teaserBlockId;
  const pendingReveal = !current && teaserBlock && !teaserShown ? teaserBlock : null;

  const modes: { id: string; label: string }[] = [
    { id: "live", label: "Domanda aperta" },
    { id: "join", label: "QR grande" },
    { id: "strips", label: "Risultato per argomento" },
    { id: "crown", label: "Convergenza" },
    ...(ev.qaEnabled ? [{ id: "qa", label: "Domande dal pubblico" }] : []),
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
        <div className="stack" style={{ minWidth: 280 }}>
          {current ? (
            <div className="alert ok">
              Aperta: <b>{current.label}</b>
            </div>
          ) : pendingReveal ? (
            <div className="alert ok">
              Chiuso <b>{pendingReveal.title}</b>: i telefoni mostrano il messaggio di suspense.{" "}
              {pendingReveal.revealReady ? "Il prima/dopo è pronto." : "Sto preparando il prima/dopo…"}
            </div>
          ) : (
            <div className="alert warn">Nessuna domanda aperta: il pubblico è in attesa.</div>
          )}
          <div className="row">
            {pendingReveal && (
              <button className="btn primary" disabled={busy} onClick={() => reveal(pendingReveal.id)}>
                ✨ Rivela: {pendingReveal.title}
              </button>
            )}
            {current?.q.type === "quiz" && (
              <button
                className={`btn ${current.q.revealed ? "" : "primary"}`}
                disabled={busy}
                onClick={() => control({ reveal: { questionId: current.q.id, revealed: !current.q.revealed } })}
              >
                {current.q.revealed ? "Nascondi soluzione" : "Mostra soluzione"}
              </button>
            )}
            {next && (
              <button className={`btn ${pendingReveal ? "" : "primary"}`} disabled={busy} onClick={() => control({ activeQuestionId: next.q.id })}>
                Apri: {next.label} →
              </button>
            )}
            {current && (
              <button className="btn" disabled={busy} onClick={() => control({ activeQuestionId: null })}>
                Chiudi
              </button>
            )}
          </div>
        </div>
      </div>
      {err && <div className="alert error">{err}</div>}

      <div className="stack" style={{ gap: 8 }}>
        {data.blocks.map((b, bi) => {
          const isCurrent = b.questions.some((q) => q.id === ev.activeQuestionId);
          const onScreen = ev.screenMode === "reveal" && ev.screenBlockId === b.id;
          return (
            <div key={b.id} className={`block-row ${isCurrent ? "current" : ""}`}>
              <div className="block-num">{bi + 1}</div>
              <div>
                <b>{b.title}</b>
                <div className="tiny muted">
                  {b.questions
                    .filter((q) => q.headline)
                    .map((q) => `${qName(q, b.questions.indexOf(q))}: ${q.headline}`)
                    .join(" · ")}
                  {b.questions.length === 0 && "Nessuna domanda: aggiungile in Impostazioni e domande"}
                </div>
              </div>
              <div className="phase-btns">
                {b.questions.map((q, i) => {
                  const on = q.id === ev.activeQuestionId;
                  return (
                    <button
                      key={q.id}
                      className={`btn phase-btn ${on ? "on" : ""}`}
                      disabled={busy || on}
                      onClick={() => control({ activeQuestionId: q.id })}
                      title={q.prompt}
                    >
                      {qName(q, i)}
                      <small>
                        {on ? "aperta · " : ""}
                        {q.respondents} risp.
                        {q.inSummary ? " · ★" : ""}
                      </small>
                    </button>
                  );
                })}
                {b.hasPair && (
                  <button
                    className={`btn phase-btn ${onScreen ? "on" : ""}`}
                    disabled={busy}
                    onClick={() => reveal(b.id, !b.revealReady || onScreen)}
                    title={onScreen ? "Ricalcola con le ultime risposte" : "Mostra sul proiettore il prima/dopo di questo blocco"}
                  >
                    ✨ Rivela
                    <small>{onScreen ? "sullo schermo · ricalcola" : b.revealReady ? `pronto${b.revealAi ? " · AI" : ""}` : "da preparare"}</small>
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {data.blocks.length === 0 && <p className="muted">Nessun blocco: aggiungili in Impostazioni e domande.</p>}
        <p className="tiny muted">
          ★ = domanda nel riepilogo finale. Chiudendo l&apos;ultima domanda a parole di un blocco (aprendo la successiva o con
          Chiudi), l&apos;app prepara il prima/dopo e manda ai telefoni il messaggio di suspense; tu scegli quando premere{" "}
          <b>Rivela</b>.
        </p>
      </div>

      <div className="card stack">
        <h2>Schermo del proiettore</h2>
        <div className="row">
          {modes.map((m) => (
            <button key={m.id} className={`btn sm ${ev.screenMode === m.id ? "on" : ""}`} disabled={busy} onClick={() => control({ screenMode: m.id })}>
              {m.label}
            </button>
          ))}
        </div>
        <p className="tiny muted">
          Aprendo una domanda lo schermo torna da solo sulla domanda aperta. Apri lo schermo proiettore in una finestra a parte, a
          tutto schermo (F11).
        </p>
      </div>

      <ConvergenceCard eventId={ev.id} summary={ev.aiSummary} refresh={refresh} onShow={() => control({ screenMode: "crown" })} />

      <div className="card spread">
        <div>
          <b>Risultati pubblici</b>
          <div className="small muted">
            {ev.resultsPublished
              ? "Pubblicati: tutti i telefoni mostrano solo i risultati. Domande e Q&A sono chiusi."
              : "Pubblicando, chiunque apra il QR vede solo i risultati finali: le domande si chiudono."}
          </div>
        </div>
        <button
          className={`btn ${ev.resultsPublished ? "" : "primary"}`}
          disabled={busy}
          onClick={() =>
            (ev.resultsPublished || confirm("Pubblicare i risultati? I telefoni mostreranno solo i risultati e non si potrà più rispondere.")) &&
            run(() => postJson(`/api/admin/events/${ev.id}`, { resultsPublished: !ev.resultsPublished }, "PATCH"))
          }
        >
          {ev.resultsPublished ? "Ritira i risultati" : "Pubblica i risultati"}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ConvergenceCard({
  eventId,
  summary,
  refresh,
  onShow,
}: {
  eventId: string;
  summary: unknown;
  refresh: () => Promise<void>;
  onShow: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const conv = summary && (summary as { version?: number }).version === 2 ? (summary as CrownData & { model?: string }) : null;

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Errore");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card stack">
      <div className="spread">
        <div>
          <h2 style={{ margin: 0 }}>Convergenza finale</h2>
          <div className="small muted">
            Le 9 parole più forti dei podi di fine blocco convergono, animate, in 3 macro-temi scelti dall&apos;AI. Preparala
            quando tutti i blocchi sono chiusi.
          </div>
        </div>
        <div className="row">
          <button className={`btn ${conv ? "" : "primary"}`} disabled={busy} onClick={() => run(() => postJson(`/api/admin/events/${eventId}/convergence`))}>
            {busy ? "Preparazione…" : conv ? "Rigenera" : "✨ Prepara convergenza"}
          </button>
          <button className="btn" disabled={busy} onClick={() => void onShow()}>
            Mostra sul proiettore
          </button>
          {conv && (
            <button
              className="btn ghost danger"
              disabled={busy}
              onClick={() => confirm("Eliminare la convergenza preparata?") && run(() => postJson(`/api/admin/events/${eventId}/convergence`, undefined, "DELETE"))}
            >
              Elimina
            </button>
          )}
        </div>
      </div>
      {err && <div className="alert error">{err}</div>}
      {conv ? (
        <>
          <ThemesList data={conv} />
          <p className="tiny muted">
            Preparata il {conv.generatedAt ? new Date(conv.generatedAt).toLocaleString("it-IT") : "—"}. Se arrivano nuove risposte,
            premi Rigenera.
          </p>
        </>
      ) : (
        <p className="small muted">
          Senza preparazione, la schermata Convergenza mostra comunque le 9 parole più forti, che convergono nel titolo
          dell&apos;evento.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

interface WordRow {
  key: string;
  label: string;
  counts: Record<string, number>;
  forms: string[];
}
interface WordsData {
  block: { id: string; title: string };
  columns: { id: string; label: string; respondents: number }[];
  words: WordRow[];
  aliases: { sourceKey: string; targetLabel: string }[];
}
interface AiGroup {
  label: string;
  members: { label: string; key: string; count: number }[];
  selected?: boolean;
}

function WordsTab({ eventId, blocks }: { eventId: string; blocks: Block[] }) {
  const wordBlocks = blocks.filter((b) => b.questions.some((q) => q.type === "words"));
  const [blockId, setBlockId] = useState(wordBlocks[0]?.id ?? "");
  const { data, error, refresh } = usePolling<WordsData>(blockId ? `/api/admin/events/${eventId}/blocks/${blockId}/words` : null, 5000);
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

  const total = (w: WordRow) => Object.values(w.counts).reduce((s, n) => s + n, 0);
  const selectedRows = useMemo(() => (data?.words ?? []).filter((w) => selected.has(w.key)), [data, selected]);
  useEffect(() => {
    if (selectedRows.length) setLabel([...selectedRows].sort((a, b) => total(b) - total(a))[0].label);
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
          {wordBlocks.map((b) => (
            <option key={b.id} value={b.id}>
              {blocks.indexOf(b) + 1}. {b.title}
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
        significato (es. “utenti” in “identità”): valgono per tutte le domande a parole del blocco e si possono sciogliere
        in qualsiasi momento.
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
            {data.columns.map((c) => `${c.label}: ${c.respondents} risposte`).join(" · ")} · {data.words.length} voci
          </p>
        )}
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 32 }} />
              <th>Voce</th>
              {data?.columns.map((c) => (
                <th key={c.id} className="num">
                  {c.label}
                </th>
              ))}
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
                {data!.columns.map((c) => (
                  <td key={c.id} className="num">
                    {w.counts[c.id] || ""}
                  </td>
                ))}
              </tr>
            ))}
            {data && data.words.length === 0 && (
              <tr>
                <td colSpan={2 + data.columns.length} className="muted">
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

interface EditQuestion {
  id?: string;
  key: string;
  type: QType;
  label: string;
  prompt: string;
  maxWords: number;
  options: string[];
  multiple: boolean;
  correct: number[];
  scaleMin: number;
  scaleMax: number;
  scaleMinLabel: string;
  scaleMaxLabel: string;
  inSummary: boolean;
  respondents: number;
  originalType?: QType;
}
interface EditBlock {
  id?: string;
  key: string;
  title: string;
  questions: EditQuestion[];
}

let keySeq = 0;
const newKey = () => `k${++keySeq}`;

function toEdit(q: Q): EditQuestion {
  return {
    id: q.id,
    key: q.id,
    type: q.type,
    label: q.label,
    prompt: q.prompt,
    maxWords: q.maxWords,
    options: q.options.length ? q.options : ["", ""],
    multiple: q.multiple,
    correct: q.correct,
    scaleMin: q.scaleMin,
    scaleMax: q.scaleMax,
    scaleMinLabel: q.scaleMinLabel,
    scaleMaxLabel: q.scaleMaxLabel,
    inSummary: q.inSummary,
    respondents: q.respondents,
    originalType: q.type,
  };
}

function newEditQuestion(type: QType, blockTitle: string): EditQuestion {
  const d = defaultQuestion(type, blockTitle);
  return { ...d, key: newKey(), respondents: 0, options: d.options.length ? d.options : ["", ""] };
}

function moveItem<T>(list: T[], i: number, d: number): T[] {
  const j = i + d;
  if (j < 0 || j >= list.length) return list;
  const n = [...list];
  [n[i], n[j]] = [n[j], n[i]];
  return n;
}

function QuestionEditor({
  q,
  index,
  count,
  onChange,
  onMove,
  onRemove,
}: {
  q: EditQuestion;
  index: number;
  count: number;
  onChange: (patch: Partial<EditQuestion>) => void;
  onMove: (d: number) => void;
  onRemove: () => void;
}) {
  const hasOptions = q.type === "choice" || q.type === "quiz";
  const typeChangedWithAnswers = q.originalType && q.originalType !== q.type && q.respondents > 0;

  return (
    <div className="q-editor stack" style={{ gap: 10 }}>
      <div className="row">
        <b className="small">{index + 1}.</b>
        <select value={q.type} onChange={(e) => onChange({ type: e.target.value as QType })} style={{ width: "auto" }} aria-label="Tipo di domanda">
          {QTYPES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={q.label}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="Etichetta (es. Inizio)"
          maxLength={30}
          style={{ width: 170 }}
          aria-label="Etichetta"
        />
        <label className="check small" style={{ alignItems: "center" }}>
          <input type="checkbox" checked={q.inSummary} onChange={(e) => onChange({ inSummary: e.target.checked })} style={{ marginTop: 0 }} />
          Nel riepilogo
        </label>
        <span style={{ flex: 1 }} />
        <button className="btn sm" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Sposta su">
          ↑
        </button>
        <button className="btn sm" onClick={() => onMove(1)} disabled={index === count - 1} aria-label="Sposta giù">
          ↓
        </button>
        <button className="btn sm danger" onClick={onRemove}>
          Rimuovi{q.respondents ? ` (${q.respondents})` : ""}
        </button>
      </div>
      <div className="tiny muted">{QTYPES.find((t) => t.id === q.type)?.hint}</div>
      {typeChangedWithAnswers && (
        <div className="alert warn small">Cambiando tipo, le {q.respondents} risposte già date a questa domanda verranno eliminate.</div>
      )}
      <input type="text" value={q.prompt} onChange={(e) => onChange({ prompt: e.target.value })} placeholder="Testo della domanda" aria-label="Testo della domanda" />

      {q.type === "words" && (
        <label className="field" style={{ maxWidth: 200 }}>
          <span>Parole per persona</span>
          <input type="number" min={1} max={10} value={q.maxWords} onChange={(e) => onChange({ maxWords: Number(e.target.value) })} />
        </label>
      )}

      {hasOptions && (
        <div className="stack" style={{ gap: 6 }}>
          <span className="small" style={{ fontWeight: 600 }}>
            Opzioni{q.type === "quiz" ? " (spunta quelle corrette)" : ""}
          </span>
          {q.options.map((o, i) => (
            <div key={i} className="opt-row">
              {q.type === "quiz" && (
                <input
                  type="checkbox"
                  checked={q.correct.includes(i)}
                  onChange={(e) =>
                    onChange({ correct: e.target.checked ? [...q.correct, i] : q.correct.filter((c) => c !== i) })
                  }
                  aria-label={`Opzione ${i + 1} corretta`}
                  style={{ width: 18, height: 18 }}
                />
              )}
              <input
                type="text"
                value={o}
                onChange={(e) => onChange({ options: q.options.map((x, j) => (j === i ? e.target.value : x)) })}
                placeholder={`Opzione ${i + 1}`}
                aria-label={`Opzione ${i + 1}`}
              />
              <button
                className="btn sm ghost"
                disabled={q.options.length <= 2}
                onClick={() =>
                  onChange({
                    options: q.options.filter((_, j) => j !== i),
                    correct: q.correct.filter((c) => c !== i).map((c) => (c > i ? c - 1 : c)),
                  })
                }
                aria-label={`Rimuovi opzione ${i + 1}`}
              >
                ✕
              </button>
            </div>
          ))}
          <div className="row">
            <button className="btn sm" disabled={q.options.length >= 12} onClick={() => onChange({ options: [...q.options, ""] })}>
              + Opzione
            </button>
            <label className="check small" style={{ alignItems: "center" }}>
              <input type="checkbox" checked={q.multiple} onChange={(e) => onChange({ multiple: e.target.checked })} style={{ marginTop: 0 }} />
              Più risposte ammesse
            </label>
          </div>
          {q.respondents > 0 && <p className="tiny muted">Se cambi l&apos;ordine delle opzioni, le risposte già date restano legate alla posizione.</p>}
        </div>
      )}

      {q.type === "scale" && (
        <div className="row">
          <label className="field" style={{ width: 90 }}>
            <span>Da</span>
            <input type="number" min={0} max={9} value={q.scaleMin} onChange={(e) => onChange({ scaleMin: Number(e.target.value) })} />
          </label>
          <label className="field" style={{ width: 90 }}>
            <span>A</span>
            <input type="number" min={1} max={10} value={q.scaleMax} onChange={(e) => onChange({ scaleMax: Number(e.target.value) })} />
          </label>
          <label className="field" style={{ flex: 1, minWidth: 140 }}>
            <span>Etichetta del minimo</span>
            <input type="text" value={q.scaleMinLabel} onChange={(e) => onChange({ scaleMinLabel: e.target.value })} placeholder="Poco" />
          </label>
          <label className="field" style={{ flex: 1, minWidth: 140 }}>
            <span>Etichetta del massimo</span>
            <input type="text" value={q.scaleMaxLabel} onChange={(e) => onChange({ scaleMaxLabel: e.target.value })} placeholder="Molto" />
          </label>
        </div>
      )}
    </div>
  );
}

function SettingsTab({ data, refresh }: { data: EventState; refresh: () => Promise<void> }) {
  const router = useRouter();
  const ev = data.event;
  const [title, setTitle] = useState(ev.title);
  const [qaEnabled, setQaEnabled] = useState(ev.qaEnabled);
  const [qaModerated, setQaModerated] = useState(ev.qaModerated);
  const [blocks, setBlocks] = useState<EditBlock[]>(() =>
    data.blocks.map((b) => ({ id: b.id, key: b.id, title: b.title, questions: b.questions.map(toEdit) })),
  );
  const [addType, setAddType] = useState<Record<string, QType>>({});
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [resetCode, setResetCode] = useState("");
  const [resetAliases, setResetAliases] = useState(false);
  const [demoCount, setDemoCount] = useState(25);
  const [demoMsg, setDemoMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const editBlocks = (fn: (bs: EditBlock[]) => EditBlock[]) => {
    setBlocks(fn);
    setDirty(true);
  };
  const editQuestion = (bi: number, qi: number, patch: Partial<EditQuestion>) =>
    editBlocks((bs) => bs.map((b, i) => (i !== bi ? b : { ...b, questions: b.questions.map((q, j) => (j === qi ? { ...q, ...patch } : q)) })));

  async function save() {
    const kept = new Set(blocks.flatMap((b) => b.questions.map((q) => q.id)).filter(Boolean));
    const lost = data.blocks.flatMap((b) => b.questions).filter((q) => !kept.has(q.id)).reduce((s, q) => s + q.respondents, 0);
    const retyped = blocks.flatMap((b) => b.questions).filter((q) => q.originalType && q.originalType !== q.type).reduce((s, q) => s + q.respondents, 0);
    if (lost + retyped > 0 && !confirm(`Verranno eliminate ${lost + retyped} risposte (domande rimosse o cambiate di tipo). Continuare?`)) return;
    setBusy(true);
    setMsg(null);
    try {
      await postJson(
        `/api/admin/events/${ev.id}`,
        {
          title,
          qaEnabled,
          qaModerated,
          blocks: blocks.map((b) => ({
            id: b.id,
            title: b.title,
            questions: b.questions.map((q) => ({ ...q, options: q.options.filter((o) => o.trim()) })),
          })),
        },
        "PATCH",
      );
      // riparte dai dati del server, così le domande nuove hanno il loro id
      const fresh = (await (await fetch(`/api/admin/events/${ev.id}`, { cache: "no-store" })).json()) as EventState;
      setBlocks(fresh.blocks.map((b) => ({ id: b.id, key: b.id, title: b.title, questions: b.questions.map(toEdit) })));
      await refresh();
      setDirty(false);
      setMsg({ kind: "ok", text: "Salvato." });
      router.refresh();
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : "Errore" });
    } finally {
      setBusy(false);
    }
  }

  const saveBar = (
    <div className="row">
      <button className="btn primary" disabled={busy} onClick={save}>
        Salva impostazioni e domande
      </button>
      {dirty && <span className="small muted">Modifiche non salvate</span>}
    </div>
  );

  return (
    <div className="stack">
      <div className="card stack">
        <h2>Evento</h2>
        <label className="field">
          <span>Titolo</span>
          <input
            type="text"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setDirty(true);
            }}
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={qaEnabled}
            onChange={(e) => {
              setQaEnabled(e.target.checked);
              setDirty(true);
            }}
          />
          <span>
            <b>Domande dal pubblico (Q&amp;A)</b>
            <br />
            <span className="small muted">Se spento, il Q&amp;A non compare da nessuna parte: né sul telefono né in regia.</span>
          </span>
        </label>
        {qaEnabled && (
          <label className="check">
            <input
              type="checkbox"
              checked={qaModerated}
              onChange={(e) => {
                setQaModerated(e.target.checked);
                setDirty(true);
              }}
            />
            <span>
              <b>Approva le domande prima di mostrarle</b>
              <br />
              <span className="small muted">Le nuove domande restano visibili solo all&apos;autore finché non le approvi.</span>
            </span>
          </label>
        )}
      </div>

      <div className="card stack">
        <div className="spread">
          <h2 style={{ margin: 0 }}>Blocchi e domande</h2>
          {saveBar}
        </div>
        <p className="small muted">
          Ogni blocco (o sezione) può avere tutte le domande che vuoi, di qualsiasi tipo. Per una domanda singola a inizio o
          fine evento, ad esempio il gradimento, crea un blocco apposito come “Apertura” o “Chiusura”. Le domande con{" "}
          <b>Nel riepilogo</b> finiscono nella pagina e nella schermata finale.
        </p>
        {blocks.map((b, bi) => (
          <div key={b.key} className="stack" style={{ borderTop: bi ? "1px solid var(--border)" : 0, paddingTop: bi ? 16 : 0 }}>
            <div className="row">
              <span className="block-num">{bi + 1}</span>
              <input
                type="text"
                value={b.title}
                onChange={(e) => editBlocks((bs) => bs.map((x, i) => (i === bi ? { ...x, title: e.target.value } : x)))}
                style={{ flex: 1, width: "auto", fontWeight: 700 }}
                aria-label="Titolo blocco"
              />
              <button className="btn sm" onClick={() => editBlocks((bs) => moveItem(bs, bi, -1))} disabled={bi === 0} aria-label="Sposta blocco su">
                ↑
              </button>
              <button
                className="btn sm"
                onClick={() => editBlocks((bs) => moveItem(bs, bi, 1))}
                disabled={bi === blocks.length - 1}
                aria-label="Sposta blocco giù"
              >
                ↓
              </button>
              <button className="btn sm danger" onClick={() => editBlocks((bs) => bs.filter((_, i) => i !== bi))}>
                Rimuovi blocco
              </button>
            </div>
            <div>
              {b.questions.map((q, qi) => (
                <QuestionEditor
                  key={q.key}
                  q={q}
                  index={qi}
                  count={b.questions.length}
                  onChange={(patch) => editQuestion(bi, qi, patch)}
                  onMove={(d) => editBlocks((bs) => bs.map((x, i) => (i === bi ? { ...x, questions: moveItem(x.questions, qi, d) } : x)))}
                  onRemove={() => editBlocks((bs) => bs.map((x, i) => (i === bi ? { ...x, questions: x.questions.filter((_, j) => j !== qi) } : x)))}
                />
              ))}
              {b.questions.length === 0 && <p className="small muted">Nessuna domanda in questo blocco.</p>}
            </div>
            <div className="row">
              <select
                value={addType[b.key] ?? "words"}
                onChange={(e) => setAddType((m) => ({ ...m, [b.key]: e.target.value as QType }))}
                style={{ width: "auto" }}
                aria-label="Tipo della nuova domanda"
              >
                {QTYPES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
              <button
                className="btn"
                onClick={() =>
                  editBlocks((bs) =>
                    bs.map((x, i) => (i === bi ? { ...x, questions: [...x.questions, newEditQuestion(addType[b.key] ?? "words", x.title)] } : x)),
                  )
                }
              >
                + Aggiungi domanda
              </button>
            </div>
          </div>
        ))}
        <div>
          <button className="btn" onClick={() => editBlocks((bs) => [...bs, { key: newKey(), title: "Nuovo blocco", questions: [] }])}>
            + Aggiungi blocco
          </button>
        </div>
        {msg && <div className={`alert ${msg.kind}`}>{msg.text}</div>}
        {saveBar}
      </div>

      <div className="card stack">
        <h2>Esporta</h2>
        <p className="small muted">CSV con separatore “;”, si apre direttamente in Excel.</p>
        <div className="row">
          <a className="btn" href={`/api/admin/events/${ev.id}/export?type=summary`}>
            Risultati di tutte le domande
          </a>
          <a className="btn" href={`/api/admin/events/${ev.id}/export?type=raw`}>
            Tutte le risposte
          </a>
        </div>
      </div>

      <div className="card stack">
        <h2>Dati di prova</h2>
        <p className="small muted">
          Crea partecipanti finti (nickname “… (prova N)”) che rispondono a tutte le domande dell&apos;evento, con risposte
          credibili per ogni tipo. Utile per provare proiettore, unioni di parole, AI e risultati. Si cancellano con{" "}
          <b>Azzera le prove</b> qui sotto.
        </p>
        <div className="row">
          <input
            type="number"
            min={1}
            max={80}
            value={demoCount}
            onChange={(e) => setDemoCount(Number(e.target.value))}
            style={{ width: 100 }}
            aria-label="Numero di partecipanti di prova"
          />
          <button
            className="btn"
            disabled={busy || dirty}
            onClick={async () => {
              setBusy(true);
              setDemoMsg(null);
              try {
                const r = await postJson<{ participants: number; questions: number }>(`/api/admin/events/${ev.id}/demo`, {
                  participants: demoCount,
                });
                setDemoMsg({ kind: "ok", text: `Creati ${r.participants} partecipanti di prova con risposte a ${r.questions} domande.` });
                await refresh();
              } catch (e) {
                setDemoMsg({ kind: "error", text: e instanceof Error ? e.message : "Errore" });
              } finally {
                setBusy(false);
              }
            }}
          >
            Genera risposte di prova
          </button>
          {dirty && <span className="small muted">Salva prima le modifiche alle domande</span>}
        </div>
        {demoMsg && <div className={`alert ${demoMsg.kind}`}>{demoMsg.text}</div>}
      </div>

      <div className="card stack" style={{ borderColor: "var(--danger)" }}>
        <h2>Zona pericolosa</h2>
        <p className="small">
          <b>Azzera le prove</b>: cancella partecipanti, risposte e domande del pubblico. Blocchi e domande restano. Utile dopo
          i test, prima dell&apos;evento vero.
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
