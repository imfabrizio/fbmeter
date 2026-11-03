import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function key(): Buffer {
  const secret = process.env.APP_ENCRYPTION_KEY;
  if (!secret || secret.length < 32) {
    throw new Error("APP_ENCRYPTION_KEY mancante o troppo corta (minimo 32 caratteri)");
  }
  return createHash("sha256").update(secret).digest();
}

/** AES-256-GCM. Formato: v1.<iv>.<tag>.<ciphertext> in base64url. */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(".");
}

export function decrypt(payload: string): string {
  const [v, iv, tag, ct] = payload.split(".");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("Formato cifrato non valido");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Codice evento leggibile: niente 0/O/1/I per evitare errori di battitura. */
export function eventCode(length = 6): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(length);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}
