import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const PREFIX = "enc:v1:";

function digest(raw: string) {
  return createHash("sha256").update(raw).digest();
}

function keys() {
  const out: Buffer[] = [];
  for (const raw of [process.env.SESSION_SECRET || "", process.env.SESSION_SECRET_PREV || ""]) {
    if (raw.length >= 16) out.push(digest(raw));
  }
  return out;
}

function reveal(stored: string) {
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
      /* next */
    }
  }
  return "";
}

function store(plain: string) {
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

function wrapField(value: string) {
  if (!value || !value.startsWith(PREFIX)) return value;
  const plain = reveal(value);
  if (!plain) return value;
  return store(plain);
}

async function main() {
  let n = 0;
  const users = await prisma.user.findMany({ select: { id: true, smtpPassword: true, totpSecret: true } });
  for (const u of users) {
    const smtpPassword = wrapField(u.smtpPassword);
    const totpSecret = wrapField(u.totpSecret);
    if (smtpPassword !== u.smtpPassword || totpSecret !== u.totpSecret) {
      await prisma.user.update({ where: { id: u.id }, data: { smtpPassword, totpSecret } });
      n += 1;
    }
  }
  const settings = await prisma.appSettings.findUnique({ where: { id: "default" } });
  if (settings) {
    const data = {
      smtpPassword: wrapField(settings.smtpPassword),
      imapPassword: wrapField(settings.imapPassword),
      fnsPassword: wrapField(settings.fnsPassword),
      chatDek: wrapField(settings.chatDek),
    };
    if (
      data.smtpPassword !== settings.smtpPassword ||
      data.imapPassword !== settings.imapPassword ||
      data.fnsPassword !== settings.fnsPassword ||
      data.chatDek !== settings.chatDek
    ) {
      await prisma.appSettings.update({ where: { id: "default" }, data });
      n += 1;
    }
  }
  console.log("reencrypted", n);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
