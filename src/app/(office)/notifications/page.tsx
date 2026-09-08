import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { fmtDateTime } from "@/lib/dates";
import Link from "next/link";

export default async function NotificationsPage() {
  const user = await requireUser();
  const rows = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  return (
    <div>
      <PageHeader title="Уведомления" />
      <ul className="divide-y divide-line rounded-2xl border border-line bg-card">
        {rows.map((n) => (
          <li key={n.id} className="px-4 py-3">
            <Link href={n.link || "/"}>
              <div className="font-semibold">
                {n.title}
                {n.urgency === "urgent" ? (
                  <span className="ml-2 rounded-full bg-gold/20 px-2 py-0.5 text-xs font-bold text-gold">срочно</span>
                ) : null}
              </div>
              <div className="text-sm text-muted">
                {n.body} · {fmtDateTime(n.createdAt)}
              </div>
            </Link>
          </li>
        ))}
        {rows.length === 0 ? <li className="px-4 py-8 text-muted">Пока пусто</li> : null}
      </ul>
    </div>
  );
}
