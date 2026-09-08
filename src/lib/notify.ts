import { prisma } from "./prisma";
import { sendWebPushToUser } from "./push";
import { parseUrgency, type Urgency } from "./notify-urgency";

export type NotifyPayload = {
  title: string;
  body?: string;
  link?: string;
  urgency?: Urgency;
};

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
}

export async function notifyMany(userIds: string[], payload: NotifyPayload) {
  for (const userId of userIds) {
    await notify({ userId, ...payload });
  }
}
