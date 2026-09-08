import webpush from "web-push";
import { prisma } from "./prisma";

export type PushPayload = { title: string; body?: string; link?: string; urgency?: string; id?: string };

function vapid() {
  const publicKey = process.env.VAPID_PUBLIC || "";
  const privateKey = process.env.VAPID_PRIVATE || "";
  const mail = process.env.VAPID_MAIL || "mailto:info@videal-doc.ru";
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, mail };
}

let vapidReady = false;
function ensureVapid() {
  const keys = vapid();
  if (!keys) return false;
  if (!vapidReady) {
    webpush.setVapidDetails(keys.mail, keys.publicKey, keys.privateKey);
    vapidReady = true;
  }
  return true;
}

export function vapidPublicKey() {
  return vapid()?.publicKey || "";
}

export async function sendWebPushToUser(userId: string, payload: PushPayload) {
  const rows = await prisma.webPushSub.findMany({ where: { userId } });
  if (rows.length === 0) return { sent: 0, failed: 0, none: true as const };
  if (!ensureVapid()) return { sent: 0, failed: rows.length, none: false as const, error: "Нет VAPID ключей на сервере" };

  const body = JSON.stringify({
    title: payload.title || "Видеал.Док",
    body: payload.body || "",
    link: payload.link || "/",
    urgency: payload.urgency || "normal",
    id: payload.id || "",
  });
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      await webpush.sendNotification(
        { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
        body,
        { TTL: 60 * 30 },
      );
      sent += 1;
      if (row.lastError) {
        await prisma.webPushSub.update({ where: { id: row.id }, data: { lastError: "" } });
      }
    } catch (e) {
      failed += 1;
      const err = e as { statusCode?: number; message?: string };
      const gone = err.statusCode === 404 || err.statusCode === 410;
      if (gone) {
        await prisma.webPushSub.delete({ where: { id: row.id } }).catch(() => {});
      } else {
        await prisma.webPushSub
          .update({
            where: { id: row.id },
            data: { lastError: (err.message || "push").slice(0, 200) },
          })
          .catch(() => {});
      }
    }
  }
  return { sent, failed, none: false as const };
}

export async function pushStatus() {
  const [subs, grouped] = await Promise.all([
    prisma.webPushSub.count(),
    prisma.webPushSub.groupBy({ by: ["userId"], _count: true }),
  ]);
  const users = grouped.length
    ? await prisma.user.findMany({
        where: { id: { in: grouped.map((g) => g.userId) } },
        select: { id: true, login: true, lastName: true, firstName: true },
      })
    : [];
  return {
    subscriptions: subs,
    vapid: Boolean(vapidPublicKey()),
    people: users.map((p) => ({
      id: p.id,
      login: p.login,
      name: `${p.lastName} ${p.firstName}`.trim(),
    })),
  };
}
