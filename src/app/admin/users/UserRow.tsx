"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "@/components/usePolling";

interface U {
  id: string;
  email: string;
  name: string | null;
  provider: string | null;
  role: string;
  lastLoginAt: string | null;
}

const PROVIDERS: Record<string, string> = { "microsoft-entra-id": "Microsoft", google: "Google", dev: "Sviluppo" };

export function UserRow({ user, isMe, fromEnv }: { user: U; isMe: boolean; fromEnv: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Errore");
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr>
      <td>
        <b>{user.email}</b>
        {user.name && <div className="tiny muted">{user.name}</div>}
        {fromEnv && <div className="tiny muted">Amministratore fisso (ADMIN_EMAILS)</div>}
        {!user.lastLoginAt && <div className="tiny muted">Invitato: non ha ancora fatto l&apos;accesso</div>}
        {err && <div className="tiny" style={{ color: "var(--danger)" }}>{err}</div>}
      </td>
      <td className="small">{PROVIDERS[user.provider ?? ""] ?? user.provider ?? "—"}</td>
      <td className="small">{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString("it-IT") : "—"}</td>
      <td>
        <select
          value={user.role}
          disabled={busy || isMe || fromEnv}
          onChange={(e) => {
            const role = e.target.value;
            if (role === "admin" && !confirm(`Rendere ${user.email} amministratore? Potrà gestire utenti e ruoli, compreso il tuo.`)) return;
            run(() => postJson(`/api/admin/users/${user.id}`, { role }, "PATCH"));
          }}
          aria-label={`Ruolo di ${user.email}`}
        >
          <option value="pending">In attesa</option>
          <option value="operator">Operatore</option>
          <option value="admin">Amministratore</option>
        </select>
      </td>
      <td>
        {!isMe && (
          <button
            className="btn sm danger"
            disabled={busy}
            onClick={() => confirm(`Eliminare ${user.email}?`) && run(() => postJson(`/api/admin/users/${user.id}`, undefined, "DELETE"))}
          >
            Elimina
          </button>
        )}
      </td>
    </tr>
  );
}
