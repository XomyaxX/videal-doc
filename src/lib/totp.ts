import { createHmac, randomBytes } from "crypto";

const ALPH = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function newTotpSecret() {
  return base32Encode(randomBytes(20));
}

export function totpCode(secret: string, at = Date.now()) {
  const key = base32Decode(secret);
  const counter = Math.floor(at / 30000);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(bin % 1_000_000).padStart(6, "0");
}

export function totpOk(secret: string, code: string, at = Date.now()) {
  const got = String(code || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(got) || !secret) return false;
  for (const d of [-1, 0, 1]) {
    if (totpCode(secret, at + d * 30000) === got) return true;
  }
  return false;
}

export function totpUrl(login: string, secret: string) {
  const label = encodeURIComponent(`Видеал.Док:${login}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent("Видеал.Док")}&digits=6&period=30`;
}

function base32Encode(buf: Buffer) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of buf) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPH[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPH[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str: string) {
  const s = str.toUpperCase().replace(/=+$/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of s) {
    const i = ALPH.indexOf(ch);
    if (i < 0) continue;
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}
