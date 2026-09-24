import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const PREFIX = "enc:v1:";

function digest(raw: string) {
  return createHash("sha256").update(raw).digest();
}

function keys(): Buffer[] {
  const out: Buffer[] = [];
  for (const raw of [process.env.SESSION_SECRET || "", process.env.SESSION_SECRET_PREV || ""]) {
    if (raw.length >= 16) out.push(digest(raw));
  }
  return out;
}

export function storeSecret(plain: string) {
  const text = (plain || "").trim();
  if (!text) return "";
  const list = keys();
  if (!list.length) return text;
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", list[0], iv);
  const enc = Buffer.concat([c.update(text, "utf8"), c.final()]);
  const tag = c.getAuthTag();
  return PREFIX + [iv, tag, enc].map((b) => b.toString("base64url")).join(".");
}

export function revealSecret(stored: string) {
  const raw = stored || "";
  if (!raw.startsWith(PREFIX)) return raw;
  const list = keys();
  if (!list.length) return "";
  const parts = raw.slice(PREFIX.length).split(".");
  if (parts.length !== 3) return "";
  const [iv, tag, enc] = parts.map((p) => Buffer.from(p, "base64url"));
  for (const k of list) {
    try {
      const d = createDecipheriv("aes-256-gcm", k, iv);
      d.setAuthTag(tag);
      return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
    } catch {
      /* try previous key */
    }
  }
  return "";
}

export function hasSecret(stored: string) {
  return Boolean(stored);
}

export function rewrapSecret(stored: string) {
  const plain = revealSecret(stored);
  if (!plain) return stored;
  return storeSecret(plain);
}
