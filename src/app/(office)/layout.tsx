import { AppShell } from "@/components/AppShell";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { orgNameShort } from "@/lib/org";
import { PushSubscribe } from "@/components/PushSubscribe";
import { PresencePing } from "@/components/PresencePing";
import { NotifySounds } from "@/components/NotifySounds";
import { chatUnreadTotal } from "@/lib/chat-server";

export const dynamic = "force-dynamic";

export default async function OfficeLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [unread, chatUnread, me, prodTaskCount] = await Promise.all([
    prisma.notification.count({
      where: { userId: user.id, readAt: null },
    }),
    chatUnreadTotal(user.id),
    prisma.user.findUnique({ where: { id: user.id }, select: { soundAlerts: true } }),
    prisma.task.count({
      where: {
        deletedAt: null,
        status: { in: ["todo", "wip", "revise", "blocked", "done"] },
        OR: [{ assigneeId: user.id }, { helperId: user.id }],
      },
    }),
  ]);
  const org = await prisma.organization.findFirst({ select: { shortName: true, name: true } });
  return (
    <AppShell
      user={user}
      unread={unread}
      chatUnread={chatUnread}
      orgShort={orgNameShort(org)}
      prodTaskCount={prodTaskCount}
    >
      <PushSubscribe />
      <PresencePing />
      <NotifySounds enabled={me?.soundAlerts !== false} />
      {children}
    </AppShell>
  );
}
