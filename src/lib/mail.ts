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
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: MailAttachment[];
  fromUserId?: string | null;
}): Promise<{ ok: boolean; error?: string; from?: string }> {
  const to = opts.to.trim();
  if (!to || !to.includes("@")) return { ok: false, error: "Нет email" };
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
      to,
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
}): Promise<{ ok: boolean; error?: string; from?: string }> {
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
}): Promise<{ ok: boolean; error?: string; from?: string }> {
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
