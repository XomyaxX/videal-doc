import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, PageHeader, Pill } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { dueLabel, issuedYmd, reportDueYmd } from "@/lib/report-period";
import { fullName } from "@/lib/names";
import { ReportFundsPicker } from "@/components/ReportFundsPicker";
import { USER_SAFE_SELECT } from "@/lib/user-public";

export default async function FinancePage() {
  const user = await requirePermission("finance.create");
  const templates = await prisma.documentTemplate.findMany({ orderBy: { name: "asc" } });
  const mineOpen = await prisma.fundRequest.findMany({
    where: { authorId: user.id, status: "paid", advanceReportId: null, deletedAt: null, purchaseRequestId: null },
    orderBy: { paidAt: "asc" },
  });
  const allOpen = ["accountant", "admin", "superadmin"].includes(user.roleCode)
    ? await prisma.fundRequest.findMany({
        where: { status: "paid", advanceReportId: null, deletedAt: null, purchaseRequestId: null },
        include: { author: { select: USER_SAFE_SELECT } },
        orderBy: { paidAt: "asc" },
      })
    : [];

  return (
    <div>
      <PageHeader
        title="Финансы"
        subtitle="Запрос средств и авансовый отчёт. Чеки — QR или с нуля, прямо в отчёте."
      />
      {mineOpen.length > 0 ? (
        <Card className="mb-4">
          <h2 className="font-serif text-xl text-navy">Нужно отчитаться</h2>
          <p className="text-sm text-muted">Выплаченные запросы средств без авансового отчёта.</p>
          <ReportFundsPicker
            funds={mineOpen.map((f) => ({
              id: f.id,
              number: f.number,
              purpose: f.purpose,
              amount: f.amount,
              due: dueLabel(reportDueYmd(issuedYmd(f))),
            }))}
          />
        </Card>
      ) : null}
      {allOpen.length > 0 && allOpen.some((f) => f.authorId !== user.id) ? (
        <Card className="mb-4">
          <h2 className="font-serif text-xl text-navy">Сотрудники не отчитались</h2>
          <ul className="mt-3 divide-y divide-line">
            {allOpen.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3 py-2">
                <Link href={`/funds/${f.id}`} className="hover:text-gold">
                  <span className="font-semibold">
                    {f.number} · {fullName(f.author)}
                  </span>
                  <span className="mt-0.5 block text-sm text-muted">
                    {f.purpose} · {formatMoney(f.amount)} · до {dueLabel(reportDueYmd(issuedYmd(f)))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        <Link href="/advances">
          <Card className="hover:border-gold">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-serif text-xl text-navy">Авансовые отчёты</div>
                <p className="text-muted">Отчёт по запросам: QR кассового чека или расход с нуля. PDF и Excel АО-1.</p>
              </div>
              <Pill tone="ok">открыть</Pill>
            </div>
          </Card>
        </Link>
        <Link href="/funds">
          <Card className="hover:border-gold">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-serif text-xl text-navy">Запрос средств</div>
                <p className="text-muted">
                  Служебная записка на выплату. Руководитель согласует — бухгалтерия ставит в оборот.
                </p>
              </div>
              <Pill tone="ok">открыть</Pill>
            </div>
          </Card>
        </Link>
        {templates
          .filter((t) => t.code !== "funds" && t.code !== "ao1")
          .map((t) =>
            t.enabled ? (
              <Link key={t.id} href="/advances">
                <Card className="hover:border-gold">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-serif text-xl text-navy">{t.name}</div>
                      <p className="text-muted">{t.description}</p>
                    </div>
                    <Pill tone="ok">открыть</Pill>
                  </div>
                </Card>
              </Link>
            ) : (
              <Card key={t.id} className="opacity-80">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-serif text-xl text-navy">{t.name}</div>
                    <p className="text-muted">{t.description}</p>
                  </div>
                  <Pill tone="draft">скоро</Pill>
                </div>
              </Card>
            ),
          )}
      </div>
    </div>
  );
}
