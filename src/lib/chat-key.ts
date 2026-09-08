import { createCipheriv, createDecipheriv, createHash, pbkdf2Sync, randomBytes } from "crypto";
import { prisma } from "./prisma";
import { revealSecret, storeSecret } from "./secret";
import { BIP39_EN } from "./chat-words";
import type { ChatPayload } from "./chat-types";

const ITER = 310_000;

function sha256(data: Buffer) {
  return createHash("sha256").update(data).digest();
}

export async function entropyToMnemonic(entropy: Buffer): Promise<string> {
  if (entropy.length !== 16) throw new Error("Нужно 16 байт");
  const hash = sha256(entropy);
  const bits: number[] = [];
  for (const b of entropy) for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1);
  for (let i = 0; i < 4; i++) bits.push((hash[0] >> (7 - i)) & 1);
  const words: string[] = [];
  for (let i = 0; i < 12; i++) {
    let idx = 0;
    for (let j = 0; j < 11; j++) idx = (idx << 1) | bits[i * 11 + j];
    words.push(BIP39_EN[idx]);
  }
  return words.join(" ");
}

export async function mnemonicToEntropy(phrase: string): Promise<Buffer> {
  const words = phrase.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length !== 12) throw new Error("Нужно ровно 12 слов");
  const bits: number[] = [];
  for (const w of words) {
    const idx = BIP39_EN.indexOf(w);
    if (idx < 0) throw new Error(`Слова «${w}» нет в списке`);
    for (let i = 10; i >= 0; i--) bits.push((idx >> i) & 1);
  }
  const entropy = Buffer.alloc(16);
  for (let i = 0; i < 128; i++) {
    if (bits[i]) entropy[Math.floor(i / 8)] |= 1 << (7 - (i % 8));
  }
  const hash = sha256(entropy);
  for (let i = 0; i < 4; i++) {
    const expected = (hash[0] >> (7 - i)) & 1;
    if (bits[128 + i] !== expected) throw new Error("Слова не сходятся — проверьте порядок");
  }
  return entropy;
}

export function encryptBuf(dek: Buffer, data: Buffer): { iv: string; ciphertext: string } {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", dek, iv);
  const enc = Buffer.concat([c.update(data), c.final()]);
  const tag = c.getAuthTag();
  return { iv: Buffer.concat([iv, tag]).toString("base64"), ciphertext: enc.toString("base64") };
}

export function decryptBuf(dek: Buffer, ivB64: string, ctB64: string): Buffer {
  const packed = Buffer.from(ivB64, "base64");
  if (packed.length < 28) throw new Error("bad iv");
  const iv = packed.subarray(0, 12);
  const tag = packed.subarray(12, 28);
  const d = createDecipheriv("aes-256-gcm", dek, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(Buffer.from(ctB64, "base64")), d.final()]);
}

export function encryptBytesDisk(dek: Buffer, data: Buffer): { iv: string; bytes: Buffer } {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", dek, iv);
  const enc = Buffer.concat([c.update(data), c.final()]);
  const tag = c.getAuthTag();
  return { iv: Buffer.concat([iv, tag]).toString("base64"), bytes: enc };
}

export function decryptBytesDisk(dek: Buffer, ivB64: string, data: Buffer): Buffer {
  const packed = Buffer.from(ivB64, "base64");
  const iv = packed.subarray(0, 12);
  const tag = packed.subarray(12, 28);
  const d = createDecipheriv("aes-256-gcm", dek, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]);
}

let dekCache: Buffer | null = null;

export function clearChatDekCache() {
  dekCache = null;
}

export async function getChatDek(): Promise<Buffer> {
  if (dekCache) return dekCache;
  const s = await prisma.appSettings.findUnique({ where: { id: "default" } });
  if (s?.chatDek) {
    const raw = revealSecret(s.chatDek);
    if (raw) {
      dekCache = Buffer.from(raw, "base64");
      return dekCache;
    }
  }
  const dek = randomBytes(32);
  const wrapped = storeSecret(dek.toString("base64"));
  if (s) await prisma.appSettings.update({ where: { id: "default" }, data: { chatDek: wrapped } });
  else await prisma.appSettings.create({ data: { id: "default", chatDek: wrapped } });
  dekCache = dek;
  return dek;
}

export async function encryptPayload(payload: ChatPayload): Promise<{ iv: string; ciphertext: string }> {
  const dek = await getChatDek();
  return encryptBuf(dek, Buffer.from(JSON.stringify(payload), "utf8"));
}

export async function decryptPayload(iv: string, ciphertext: string): Promise<ChatPayload | null> {
  if (!iv || !ciphertext) return null;
  try {
    const dek = await getChatDek();
    const pt = decryptBuf(dek, iv, ciphertext);
    return JSON.parse(pt.toString("utf8")) as ChatPayload;
  } catch {
    return null;
  }
}

export async function encryptText(text: string): Promise<{ iv: string; ciphertext: string }> {
  const dek = await getChatDek();
  return encryptBuf(dek, Buffer.from(text, "utf8"));
}

export async function decryptText(iv: string, ciphertext: string): Promise<string> {
  if (!iv || !ciphertext) return "";
  try {
    const dek = await getChatDek();
    return decryptBuf(dek, iv, ciphertext).toString("utf8");
  } catch {
    return "";
  }
}

function kekFromPhrase(phrase: string, salt: Buffer) {
  return pbkdf2Sync(phrase.trim().toLowerCase(), salt, ITER, 32, "sha256");
}

export async function makeAdminBackup(): Promise<string> {
  const dek = await getChatDek();
  const entropy = randomBytes(16);
  const phrase = await entropyToMnemonic(entropy);
  const salt = randomBytes(16);
  const kek = kekFromPhrase(phrase, salt);
  const { iv, ciphertext } = encryptBuf(kek, dek);
  await prisma.appSettings.update({
    where: { id: "default" },
    data: { chatBackup: ciphertext, chatBackupIv: iv, chatBackupSalt: salt.toString("base64") },
  });
  return phrase;
}

export async function restoreAdminBackup(phrase: string) {
  const s = await prisma.appSettings.findUnique({ where: { id: "default" } });
  if (!s?.chatBackup || !s.chatBackupIv || !s.chatBackupSalt) throw new Error("Запаса ключа нет — сначала создайте фразу в настройках");
  const salt = Buffer.from(s.chatBackupSalt, "base64");
  const kek = kekFromPhrase(phrase, salt);
  const dek = decryptBuf(kek, s.chatBackupIv, s.chatBackup);
  await prisma.appSettings.update({
    where: { id: "default" },
    data: { chatDek: storeSecret(dek.toString("base64")) },
  });
  clearChatDekCache();
}

export async function chatKeyStatus() {
  const s = await prisma.appSettings.findUnique({ where: { id: "default" } });
  return {
    hasDek: Boolean(s?.chatDek),
    hasBackup: Boolean(s?.chatBackup),
  };
}
