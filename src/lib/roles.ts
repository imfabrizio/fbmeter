/** Ruoli operatore e utilità condivise (solo lato server). */
export const ROLES = ["pending", "operator", "admin"] as const;
export type Role = (typeof ROLES)[number];
export const isRole = (r: unknown): r is Role => typeof r === "string" && (ROLES as readonly string[]).includes(r);

export function listEnv(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Indirizzi in ADMIN_EMAILS: sempre amministratori, servono solo per il primo accesso. */
export const envAdminEmails = () => listEnv("ADMIN_EMAILS");

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
