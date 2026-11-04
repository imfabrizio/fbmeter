"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "@/components/usePolling";

/** Aggiunge un utente per email con il ruolo scelto, prima del suo primo accesso. */
export function InviteForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("operator");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (role === "admin" && !confirm(`Rendere ${email} amministratore? Potrà gestire utenti e ruoli.`)) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await postJson<{ created?: boolean }>("/api/admin/users", { email, role });
      setMsg({ ok: true, text: r.created ? `${email} aggiunto: al primo accesso avrà già il ruolo.` : `Ruolo di ${email} aggiornato.` });
      setEmail("");
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Errore" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <b>Aggiungi un utente</b>
      <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "stretch" }}>
        <input
          type="email"
          required
          placeholder="nome@azienda.it"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ flex: "1 1 260px", width: "auto" }}
          aria-label="Email"
        />
        <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Ruolo" style={{ width: "auto", flex: "0 0 auto" }}>
          <option value="operator">Operatore</option>
          <option value="admin">Amministratore</option>
        </select>
        <button className="btn primary" disabled={busy || !email}>
          {busy ? "…" : "Aggiungi"}
        </button>
      </div>
      {msg && <div className={`alert ${msg.ok ? "ok" : "error"}`}>{msg.text}</div>}
    </form>
  );
}
