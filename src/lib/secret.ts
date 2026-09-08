import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const PREFIX = "enc:v1:";

function key(): Buffer | null {
  const raw = process.env.SESSION_SECRET || "";
  if (raw.length < 16) return null;
  return createHash("sha256").update(raw).digest();
}

export function storeSecret(plain: string) {
  const text = (plain || "").trim();
  if (!text) return "";
  const k = key();
  if (!k) return text;
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", k, iv);
  const enc = Buffer.concat([c.update(text, "utf8"), c.final()]);
  const tag = c.getAuthTag();
  return PREFIX + [iv, tag, enc].map((b) => b.toString("base64url")).join(".");
}

export function revealSecret(stored: string) {
  const raw = stored || "";
  if (!raw.startsWith(PREFIX)) return raw;
  const k = key();
  if (!k) return "";
  const parts = raw.slice(PREFIX.length).split(".");
  if (parts.length !== 3) return "";
  try {
    const [iv, tag, enc] = parts.map((p) => Buffer.from(p, "base64url"));
    const d = createDecipheriv("aes-256-gcm", k, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
  } catch {
    return "";
  }
}

export function hasSecret(stored: string) {
  return Boolean(stored);
}
