import Link from "next/link";
import { requirePermission, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Button, Card, Empty, PageHeader, Pill } from "@/components/ui";
import { ADVANCE_STATUS } from "@/lib/status";
import { formatMoney } from "@/lib/money";
import { fmtDate } from "@/lib/dates";
import { fullName } from "@/lib/names";
import { USER_SAFE_SELECT } from "@/lib/user-public";

export default async function AdvancesPage() {
  const user = await requirePermission("finance.create");
  const viewAll = can(user, "finance.view_all");
  const rows = await prisma.advanceReport.findMany({
    where: { deletedAt: null, ...(viewAll ? {} : { userId: user.id }) },
    include: { user: { select: USER_SAFE_SELECT }, receipts: true },
    orderBy: { updatedAt: "desc" },
  });
  return (
    <div>
      <Link href="/finance" className="mb-2 inline-block text-sm text-muted hover:text-gold">
        ← Финансы
      </Link>
      <PageHeader
        title="Авансовые отчёты"
        subtitle="Отчёт по запросам средств: QR кассового чека или расход с нуля. PDF на бланке АО-1."
        actions={
          <Button href="/advances/new" variant="gold">
            Новый отчёт
          </Button>
        }
      />
      {rows.length === 0 ? (
        <Empty title="Отчётов ещё нет" text="Откройте SCAN и бросьте фото кассовых чеков." />
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const spent = r.receipts.reduce((s, x) => s + x.amount, 0);
            const st = ADVANCE_STATUS[r.status] || ADVANCE_STATUS.draft;
            return (
              <Link key={r.id} href={`/advances/${r.id}`}>
                <Card className="hover:border-gold">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xs text-muted">
                        {r.number} · {fmtDate(r.reportDate)}
                        {viewAll ? ` · ${fullName(r.user)}` : ""}
                      </div>
                      <div className="font-serif text-xl text-navy">{r.purpose || "Без назначения"}</div>
                      <div className="text-sm text-muted">
                        чеков {r.receipts.length} · {formatMoney(spent)}
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
