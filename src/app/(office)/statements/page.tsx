import Link from "next/link";
import { requirePermission, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Button, Card, Empty, PageHeader, Pill } from "@/components/ui";
import { HR_STATUS, hrType } from "@/lib/hrdocs";
import { fmtDate } from "@/lib/dates";
import { fullName } from "@/lib/names";
import { isHrAddressee } from "@/lib/leaders";
import { USER_SAFE_SELECT } from "@/lib/user-public";

export default async function StatementsPage({
  searchParams,
}: {
  searchParams: Promise<{ inbox?: string }>;
}) {
  const user = await requirePermission("hrdocs.create");
  const sp = await searchParams;
  const inbox = sp.inbox === "1";
  const canInbox =
    can(user, "hrdocs.review") ||
    isHrAddressee({
      position: { name: user.positionName || "" },
      role: { code: user.roleCode, name: user.roleName },
    });
  const rows = await prisma.hrRequest.findMany({
    where: inbox ? { managerId: user.id } : { authorId: user.id },
    include: { author: { select: USER_SAFE_SELECT }, manager: { select: USER_SAFE_SELECT } },
    orderBy: { createdAt: "desc" },
  });
  return (
    <div>
      <PageHeader
        title="Заявления"
        subtitle="Отгул, отпуск, больничный, объяснительная — кадровые бумаги. Печать → подпись → скан обратно."
        actions={<Button href="/statements/new">Новое заявление</Button>}
      />
      <div className="mb-4 flex gap-2">
        <Link
          href="/statements"
          className={`rounded-xl px-3 py-2 text-sm font-semibold ${!inbox ? "bg-navy !text-white" : "border border-line bg-white text-navy"}`}
        >
          Мои
        </Link>
        {canInbox ? (
          <Link
            href="/statements?inbox=1"
            className={`rounded-xl px-3 py-2 text-sm font-semibold ${inbox ? "bg-navy !text-white" : "border border-line bg-white text-navy"}`}
          >
            На мне
          </Link>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <Empty title={inbox ? "Входящих нет" : "Пока нет заявлений"} text="Создайте бланк, распечатайте и приложите подписанный скан." />
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const st = HR_STATUS[r.status] || HR_STATUS.draft;
            return (
              <Link key={r.id} href={`/statements/${r.id}`}>
                <Card className="hover:border-gold">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xs text-muted">
                        {r.number} · {hrType(r.type)?.name} · {fmtDate(r.createdAt)}
                        {inbox ? ` · ${fullName(r.author)}` : ` → ${fullName(r.manager)}`}
                      </div>
                      <div className="font-serif text-xl text-navy">{r.title}</div>
                    </div>
                    <Pill tone={st.tone}>{st.label}</Pill>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
