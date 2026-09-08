import Link from "next/link";
import { requirePermission, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Button, Card, Empty, PageHeader, Pill } from "@/components/ui";
import { FUND_STATUS } from "@/lib/status";
import { formatMoney } from "@/lib/money";
import { fmtDate } from "@/lib/dates";
import { fullName } from "@/lib/names";
import { USER_SAFE_SELECT } from "@/lib/user-public";

export default async function FundsPage() {
  const user = await requirePermission("finance.create");
  const viewAll = can(user, "finance.view_all") || can(user, "finance.approve");
  const rows = await prisma.fundRequest.findMany({
    where: {
      deletedAt: null,
      ...(viewAll ? {} : { OR: [{ authorId: user.id }, { managerId: user.id }] }),
    },
    include: {
      author: { select: USER_SAFE_SELECT },
      manager: { select: USER_SAFE_SELECT },
      purchaseRequest: { include: { ahoUser: { select: USER_SAFE_SELECT } } },
    },
    orderBy: { createdAt: "desc" },
  });
  return (
    <div>
      <Link href="/finance" className="mb-2 inline-block text-sm text-muted hover:text-gold">
        ← Финансы
      </Link>
      <PageHeader
        title="Запрос средств"
        subtitle="Служебная записка на выплату: руководитель согласует, бухгалтерия берёт в оборот"
        actions={<Button href="/funds/new">Новый запрос</Button>}
      />
      {rows.length === 0 ? (
        <Empty title="Запросов ещё нет" text="Составьте записку — после согласования она попадёт к бухгалтеру." />
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const st = FUND_STATUS[r.status] || FUND_STATUS.draft;
            return (
              <Link key={r.id} href={`/funds/${r.id}`}>
                <Card className="hover:border-gold">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xs text-muted">
                        {r.number} · {fmtDate(r.createdAt)} · {fullName(r.purchaseRequest?.ahoUser || r.author)}
                        {r.manager ? ` → ${fullName(r.manager)}` : ""}
                      </div>
                      <div className="font-serif text-xl text-navy">{r.purpose}</div>
                      <div className="text-sm text-muted">
                        {formatMoney(r.amount)}
                        {r.neededAt ? ` · нужно к ${fmtDate(r.neededAt)}` : ""}
                        {r.payee ? ` · ${r.payee}` : ""}
                      </div>
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
