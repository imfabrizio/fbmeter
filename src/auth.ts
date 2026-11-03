import NextAuth, { type NextAuthConfig } from "next-auth";
import type { Provider } from "next-auth/providers";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";

/**
 * Login operatori via OpenID Connect standard (Entra ID e/o Google).
 * Un provider è attivo solo se le sue variabili d'ambiente sono impostate.
 * Sessioni JWT: nessuna tabella di sessione, nessun legame con il database per l'auth.
 */

export const devLoginEnabled = process.env.AUTH_DEV_LOGIN_INSECURE === "1";

const providers: Provider[] = [];

if (process.env.AUTH_MICROSOFT_ENTRA_ID_ID && process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET) {
  providers.push(
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
    }),
  );
}
if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(Google({ clientId: process.env.AUTH_GOOGLE_ID, clientSecret: process.env.AUTH_GOOGLE_SECRET }));
}
if (devLoginEnabled) {
  // SOLO per sviluppo locale: accesso con la sola email, senza password.
  providers.push(
    Credentials({
      id: "dev",
      name: "Accesso di sviluppo",
      credentials: { email: { label: "Email", type: "email" } },
      authorize: async (c) => {
        const email = typeof c?.email === "string" ? c.email.trim().toLowerCase() : "";
        return email ? { id: email, email, name: email.split("@")[0] } : null;
      },
    }),
  );
}

export const providerList = providers.map((p) => {
  const cfg = typeof p === "function" ? p() : p;
  return { id: cfg.id, name: cfg.name };
});

function listEnv(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Crea o aggiorna l'operatore. ADMIN_EMAILS → admin; OPERATOR_EMAIL_DOMAINS → operator; altri → pending. */
async function upsertUser(email: string, name: string | null | undefined, provider: string) {
  const db = getDb();
  const normalized = email.toLowerCase();
  const domain = normalized.split("@")[1] ?? "";
  const isAdmin = listEnv("ADMIN_EMAILS").includes(normalized);
  const autoOperator = listEnv("OPERATOR_EMAIL_DOMAINS").includes(domain);

  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, normalized)).limit(1);
  if (existing) {
    const role = isAdmin ? "admin" : existing.role === "pending" && autoOperator ? "operator" : existing.role;
    await db
      .update(schema.users)
      .set({ name: name ?? existing.name, provider, role, lastLoginAt: new Date() })
      .where(eq(schema.users.id, existing.id));
    return { ...existing, role };
  }
  const [created] = await db
    .insert(schema.users)
    .values({
      email: normalized,
      name: name ?? null,
      provider,
      role: isAdmin ? "admin" : autoOperator ? "operator" : "pending",
      lastLoginAt: new Date(),
    })
    .returning();
  return created;
}

const config: NextAuthConfig = {
  providers,
  trustHost: true,
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  pages: { signIn: "/login" },
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account) {
        const p = (profile ?? {}) as Record<string, unknown>;
        const email =
          token.email ??
          (typeof p.preferred_username === "string" ? p.preferred_username : undefined) ??
          (typeof p.upn === "string" ? p.upn : undefined);
        if (!email) throw new Error("Il provider non ha restituito un indirizzo email");
        const user = await upsertUser(email, token.name, account.provider);
        token.uid = user.id;
        token.email = user.email;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && typeof token.uid === "string") session.user.id = token.uid;
      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(config);
