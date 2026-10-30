import { prisma } from "./prisma";
import { sendWebPushToUser } from "./push";
import { parseUrgency, type Urgency } from "./notify-urgency";
import { sendMail, siteUrl } from "./mail";
import { isHrAddressee } from "./leaders";

export type NotifyPayload = {
  title: string;
  body?: string;
  link?: string;
  urgency?: Urgency;
};

function mailEscape(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function mailInboxCopy(opts: { userId: string } & NotifyPayload) {
  const u = await prisma.user.findUnique({
    where: { id: opts.userId },
    select: {
      email: true,
      role: { select: { code: true, name: true } },
      department: { select: { name: true } },
      position: { select: { name: true } },
    },
  });
  if (!u?.email) return;
  const dept = (u.department?.name || "").toLowerCase();
  const aho = u.role?.code === "aho" || dept.includes("хозяйствен") || dept === "ахо";
  const leader = isHrAddressee({ position: u.position, role: u.role });
  if (!aho && !leader) return;
  const href = siteUrl(opts.link || "/");
  const details = [opts.title, opts.body].filter(Boolean).join("\n");
  const text = aho
    ? `Нужно проверить сайт Видеал.Док.\n\n${details}\n\n${href}`
    : `${details}\n\n${href}`;
  const html = aho
    ? `<p>Нужно проверить сайт <b>Видеал.Док</b>.</p><p>${mailEscape(opts.title)}${opts.body ? `<br>${mailEscape(opts.body)}` : ""}</p><p><a href="${mailEscape(href)}">Открыть</a></p>`
    : `<p>${mailEscape(opts.title)}${opts.body ? `<br>${mailEscape(opts.body)}` : ""}</p><p><a href="${mailEscape(href)}">Открыть</a></p>`;
  const res = await sendMail({
    to: u.email,
    subject: `Видеал.Док: ${opts.title}`,
    text,
    html,
  });
  if (!res.ok) console.error(aho ? "mail.aho-notify" : "mail.leader-notify", res.error);
}

export async function notify(opts: { userId: string } & NotifyPayload) {
  const urgency = parseUrgency(opts.urgency);
  const row = await prisma.notification.create({
    data: {
      userId: opts.userId,
      title: opts.title,
      body: opts.body || "",
      link: opts.link || "",
      urgency,
    },
  });
  void sendWebPushToUser(opts.userId, {
    title: opts.title,
    body: opts.body || "",
    link: opts.link || "/",
    urgency,
    id: row.id,
  }).catch((e) => console.error("push.notify", e));
  void mailInboxCopy(opts).catch((e) => console.error("mail.inbox-notify", e));
}

export async function notifyMany(userIds: string[], payload: NotifyPayload) {
  for (const userId of userIds) {
    await notify({ userId, ...payload });
  }
}
