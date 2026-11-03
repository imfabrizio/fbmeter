"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Aggiornamento periodico portabile (nessun servizio realtime esterno).
 * Si ferma quando la scheda è nascosta e riparte appena torna visibile.
 */
export function usePolling<T>(
  url: string | null,
  intervalMs: number,
  init?: () => RequestInit,
): { data: T | null; error: string | null; status: number | null; refresh: () => Promise<void> } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<number | null>(null);
  const initRef = useRef(init);
  initRef.current = init;
  const inflight = useRef(false);

  const refresh = useCallback(async () => {
    if (!url || inflight.current) return;
    inflight.current = true;
    try {
      const res = await fetch(url, { cache: "no-store", ...(initRef.current?.() ?? {}) });
      setStatus(res.status);
      const body = await res.json().catch(() => null);
      if (!res.ok) setError(body?.error ?? `Errore ${res.status}`);
      else {
        setError(null);
        setData(body as T);
      }
    } catch {
      setError("Connessione assente: riprovo…");
    } finally {
      inflight.current = false;
    }
  }, [url]);

  useEffect(() => {
    if (!url) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      clearInterval(timer);
      timer = setInterval(() => {
        if (!document.hidden) void refresh();
      }, intervalMs);
    };
    const onVisible = () => {
      if (!document.hidden) void refresh();
    };
    void refresh();
    start();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [url, intervalMs, refresh]);

  return { data, error, status, refresh };
}

export async function postJson<T = unknown>(url: string, body?: unknown, method = "POST", headers?: Record<string, string>): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "content-type": "application/json", ...(headers ?? {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `Errore ${res.status}`);
  return json as T;
}
