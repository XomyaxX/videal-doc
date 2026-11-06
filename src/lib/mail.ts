import { prisma } from "./prisma";
import { readStoredFile } from "./files";
import { fullName } from "./names";
import { revealSecret } from "./secret";

const SITE = "https://www.videal-doc.ru";

type MailAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

type MailResult = { ok: boolean; error?: string; from?: string; muted?: boolean };

/** Строка, список или nodemailer-адрес. Строковые вызовы остаются совместимыми. */
type Mailbox = { address: string; name?: string | null };
type MailAddressInput = string | Mailbox | readonly (string | Mailbox)[];

type SmtpAccount = {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
};

type CompanyMail = {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPassword: string;
  smtpFrom: string;
} | null | undefined;

const SMTP_BY_DOMAIN: Record<string, { host: string; port: number }> = {
  "mail.ru": { host: "smtp.mail.ru", port: 465 },
  "bk.ru": { host: "smtp.mail.ru", port: 465 },
  "list.ru": { host: "smtp.mail.ru", port: 465 },
  "inbox.ru": { host: "smtp.mail.ru", port: 465 },
  "internet.ru": { host: "smtp.mail.ru", port: 465 },
  "yandex.ru": { host: "smtp.yandex.ru", port: 465 },
  "yandex.com": { host: "smtp.yandex.ru", port: 465 },
  "ya.ru": { host: "smtp.yandex.ru", port: 465 },
  "gmail.com": { host: "smtp.gmail.com", port: 587 },
  "googlemail.com": { host: "smtp.gmail.com", port: 587 },
};

export async function mailSettings() {
  const s = await prisma.appSettings.findUnique({ where: { id: "default" } });
  if (!s) return s;
  return {
    ...s,
    smtpPassword: revealSecret(s.smtpPassword),
    imapPassword: revealSecret(s.imapPassword),
    fnsPassword: revealSecret(s.fnsPassword),
  };
}

export function smtpReady(s: {
  smtpHost: string;
  smtpFrom: string;
  smtpUser: string;
} | null | undefined): boolean {
  return Boolean(s?.smtpHost && (s.smtpFrom || s.smtpUser));
}

export function imapReady(s: { imapHost: string; imapUser: string } | null | undefined): boolean {
  return Boolean(s?.imapHost && s.imapUser);
}

export function smtpForAddress(email: string, password: string, company: CompanyMail): SmtpAccount | null {
  const addr = email.trim();
  if (!addr.includes("@") || !password) return null;
  const domain = addr.split("@")[1]?.toLowerCase() || "";
  const preset = SMTP_BY_DOMAIN[domain];
  if (preset) {
    return { host: preset.host, port: preset.port, user: addr, password, from: addr };
  }
  if (company?.smtpHost) {
    return {
      host: company.smtpHost,
      port: company.smtpPort || 587,
      user: addr,
      password,
      from: addr,
    };
  }
  return null;
}

function companyAccount(s: CompanyMail): SmtpAccount | null {
  if (!smtpReady(s) || !s) return null;
  return {
    host: s.smtpHost,
    port: s.smtpPort || 587,
    user: s.smtpUser,
    password: s.smtpPassword,
    from: s.smtpFrom || s.smtpUser,
  };
}

/**
 * Постоянный mute исходящей почты. Пустой MAIL_MUTE_* не снимает встроенные значения.
 * userId глушит sendMailToUser даже после смены email; адрес глушит любой прямой sendMail.
 */
const MAIL_MUTE_USER_IDS = ["cmtcvx67o000212mfy0mscbpc"];
const MAIL_MUTE_EMAILS = ["l.zalutskaya@list.ru"];
const MAIL_MUTED_ERROR = "Получатель отключён от исходящей рассылки";

function listTokens(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function mutedUserIds(): Set<string> {
  const ids = new Set<string>();
  for (const id of MAIL_MUTE_USER_IDS) {
    const trimmed = id.trim();
    if (trimmed) ids.add(trimmed);
  }
  for (const id of listTokens(process.env.MAIL_MUTE_USER_IDS)) ids.add(id);
  return ids;
}

function splitAddresses(raw: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  let angle = 0;
  for (const ch of raw) {
    if (ch === '"') {
      inQuotes = !inQuotes;
      cur += ch;
      continue;
    }
    if (!inQuotes && ch === "<") {
      angle += 1;
      cur += ch;
      continue;
    }
    if (!inQuotes && ch === ">" && angle > 0) {
      angle -= 1;
      cur += ch;
      continue;
    }
    if (!inQuotes && angle === 0 && (ch === "," || ch === ";")) {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function extractEmail(token: string): string | null {
  const angles = [...token.matchAll(/<([^<>]+)>/g)];
  const source = (angles.length ? angles[angles.length - 1][1] : token).trim();
  const match = source.match(
    /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+/i,
  );
  return match ? match[0].toLowerCase() : null;
}

function mutedEmails(): Set<string> {
  const out = new Set<string>();
  const add = (raw: string) => {
    for (const part of splitAddresses(raw)) {
      const email = extractEmail(part);
      if (email) out.add(email);
    }
  };
  for (const email of MAIL_MUTE_EMAILS) add(email);
  for (const part of listTokens(process.env.MAIL_MUTE_EMAILS)) add(part);
  return out;
}

function addressText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(addressText).filter(Boolean).join(", ");
  if (value && typeof value === "object" && "address" in value) {
    const address = String((value as { address?: unknown }).address || "").trim();
    if (!address) return "";
    const name = (value as { name?: unknown }).name;
    if (typeof name === "string" && name.trim()) {
      return `"${name.trim().replace(/["\\]/g, "")}" <${address}>`;
    }
    return address;
  }
  return "";
}

function partitionRecipients(value: unknown, muted: Set<string>): { kept: string[]; muted: number } {
  const raw = addressText(value).trim();
  if (!raw) return { kept: [], muted: 0 };
  const kept: string[] = [];
  let mutedCount = 0;
  const tokens = splitAddresses(raw);
  const emails = tokens.map((token) => extractEmail(token));
  const anyEmail = emails.some(Boolean);
  tokens.forEach((token, index) => {
    const email = emails[index];
    if (email && muted.has(email)) {
      mutedCount += 1;
      return;
    }
    if (!email && anyEmail) return;
    kept.push(token);
  });
  return { kept, muted: mutedCount };
}

function isMutedUserId(userId: string | null | undefined): boolean {
  if (!userId) return false;
  return mutedUserIds().has(userId.trim());
}

export async function resolveSmtp(fromUserId?: string | null): Promise<SmtpAccount | null> {
  const company = await mailSettings();
  if (fromUserId) {
    const u = await prisma.user.findUnique({
      where: { id: fromUserId },
      select: { email: true, smtpPassword: true, lastName: true, firstName: true, middleName: true },
    });
    if (u?.email && u.smtpPassword) {
      const acc = smtpForAddress(u.email, revealSecret(u.smtpPassword), company);
      if (acc) {
        acc.from = `${fullName(u)} <${u.email}>`;
        return acc;
      }
    }
  }
  return companyAccount(company);
}

export async function sendMail(opts: {
  to: MailAddressInput;
  cc?: MailAddressInput;
  bcc?: MailAddressInput;
  subject: string;
  text: string;
  html?: string;
  attachments?: MailAttachment[];
  fromUserId?: string | null;
}): Promise<MailResult> {
  const muted = mutedEmails();
  const toParts = partitionRecipients(opts.to, muted);
  const ccParts = partitionRecipients(opts.cc, muted);
  const bccParts = partitionRecipients(opts.bcc, muted);
  const mutedCount = toParts.muted + ccParts.muted + bccParts.muted;
  const kept = [...toParts.kept, ...ccParts.kept, ...bccParts.kept];
  if (!kept.some((token) => token.includes("@"))) {
    if (mutedCount > 0) return { ok: false, muted: true, error: MAIL_MUTED_ERROR };
    return { ok: false, error: "Нет email" };
  }
  const to = toParts.kept.join(", ");
  const acc = await resolveSmtp(opts.fromUserId);
  if (!acc) {
    return {
      ok: false,
      error: opts.fromUserId
        ? "Подключите свою почту в профиле (пароль приложения) или укажите SMTP студии в настройках"
        : "SMTP не настроен",
    };
  }
  try {
    const nodemailer = await import("nodemailer");
    const transport = nodemailer.createTransport({
      host: acc.host,
      port: acc.port,
      secure: acc.port === 465,
      auth: acc.user ? { user: acc.user, pass: acc.password } : undefined,
    });
    await transport.sendMail({
      from: acc.from,
      to: to || undefined,
      cc: ccParts.kept.length ? ccParts.kept.join(", ") : undefined,
      bcc: bccParts.kept.length ? bccParts.kept.join(", ") : undefined,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
      attachments: opts.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
    });
    return { ok: true, from: acc.from };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "почта";
    console.error("mail.send", msg);
    return { ok: false, error: msg };
  }
}

export async function sendMailToUser(opts: {
  userId: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: MailAttachment[];
  personDocumentId?: string;
  fromUserId?: string | null;
}): Promise<MailResult> {
  if (isMutedUserId(opts.userId)) {
    return { ok: false, muted: true, error: MAIL_MUTED_ERROR };
  }
  const user = await prisma.user.findUnique({ where: { id: opts.userId }, select: { email: true } });
  if (!user?.email) return { ok: false, error: "У сотрудника не указан email" };
  const s = await mailSettings();
  if (s && s.mailAutoSend === false && !opts.personDocumentId) {
    return { ok: false, error: "Автоотправка писем выключена" };
  }
  const result = await sendMail({
    to: user.email,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
    attachments: opts.attachments,
    fromUserId: opts.fromUserId,
  });
  if (result.ok && opts.personDocumentId) {
    await prisma.personDocument.update({
      where: { id: opts.personDocumentId },
      data: { mailedAt: new Date() },
    }).catch(() => {});
  }
  return result;
}

export async function mailStoredFileToUser(opts: {
  userId: string;
  fileId: string;
  subject: string;
  text: string;
  personDocumentId?: string;
  fromUserId?: string | null;
}): Promise<MailResult> {
  const file = await readStoredFile(opts.fileId);
  if (!file) return { ok: false, error: "Файл не найден" };
  return sendMailToUser({
    userId: opts.userId,
    subject: opts.subject,
    text: opts.text,
    attachments: [
      {
        filename: file.rec.originalName,
        content: file.buffer,
        contentType: file.rec.mimeType,
      },
    ],
    personDocumentId: opts.personDocumentId,
    fromUserId: opts.fromUserId,
  });
}

export function siteUrl(path = "") {
  return `${SITE}${path.startsWith("/") ? path : `/${path}`}`;
}

export function imapStubNote() {
  return "Входящая почта пока не разбирается: настройки сохраняем, чтобы позже скан с ящика сам попадал в «Мои документы».";
}
