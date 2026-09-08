import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, PageHeader, Pill } from "@/components/ui";
import { FUND_STATUS } from "@/lib/status";
import { formatMoney, kopecksToRub } from "@/lib/money";
import { fmtDate, fmtDateTime, toDateInput } from "@/lib/dates";
import { fullName } from "@/lib/names";
import { isFundApprover } from "@/lib/leaders";
import { dueLabel, issuedYmd, reportDueYmd } from "@/lib/report-period";
import { FundActions } from "../FundActions";

export default async function FundPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const row = await prisma.fundRequest.findFirst({
    where: { id, deletedAt: null },
    include: {
      author: { include: { position: true, department: true } },
      manager: true,
      accountant: true,
      files: true,
      purchaseRequest: {
        include: { ahoUser: { include: { position: true, department: true } } },
      },
    },
  });
  if (!row) notFound();
  const viewAll = can(user, "finance.view_all") || can(user, "finance.approve");
  if (row.authorId !== user.id && row.managerId !== user.id && !viewAll) notFound();

  const st = FUND_STATUS[row.status] || FUND_STATUS.draft;
  const stored = row.files.length
    ? await prisma.storedFile.findMany({ where: { id: { in: row.files.map((f) => f.fileId) } } })
    : [];
  const byId = Object.fromEntries(stored.map((f) => [f.id, f]));
  const people = await prisma.user.findMany({
    where: { deletedAt: null, status: "active" },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    include: { position: true, role: true, department: true },
  });
  const managers = people.filter((p) => p.id !== row.authorId && isFundApprover(p));
  if (row.managerId && !managers.some((p) => p.id === row.managerId)) {
    const current = people.find((p) => p.id === row.managerId);
    if (current) managers.unshift(current);
  }

  return (
    <div>
      <Link href="/finance" className="mb-2 inline-block text-sm text-muted hover:text-gold">
        ← Финансы
      </Link>
      <PageHeader
        title={row.number}
        subtitle={`${fullName(row.purchaseRequest?.ahoUser || row.author)}${(row.purchaseRequest?.ahoUser || row.author).position?.name ? ` · ${(row.purchaseRequest?.ahoUser || row.author).position?.name}` : ""}`}
        actions={<Pill tone={st.tone}>{st.label}</Pill>}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Card>
            <div className="text-sm text-muted">Сумма</div>
            <div className="font-serif text-4xl text-navy">{formatMoney(row.amount)}</div>
            <div className="mt-4 font-serif text-xl text-navy">{row.purpose}</div>
            {row.details ? <p className="mt-3 whitespace-pre-wrap text-muted">{row.details}</p> : null}
            <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted">Получатель</dt>
                <dd>{row.payee || "—"}</dd>
              </div>
              <div>
                <dt className="text-muted">Нужны к</dt>
                <dd>{row.neededAt ? fmtDate(row.neededAt) : "—"}</dd>
              </div>
              <div>
                <dt className="text-muted">Авансовый отчёт до</dt>
                <dd>
                  {dueLabel(reportDueYmd(issuedYmd(row)))}
                  {row.advanceReportId ? " · сдан" : row.status === "paid" ? " · не сдан" : ""}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Руководитель</dt>
                <dd>{row.manager ? fullName(row.manager) : "—"}</dd>
              </div>
              <div>
                <dt className="text-muted">Создан</dt>
                <dd>{fmtDateTime(row.createdAt)}</dd>
              </div>
            </dl>
            {row.managerNote ? (
              <p className="mt-4 rounded-xl bg-paper px-3 py-2 text-sm">
                Руководитель: {row.managerNote}
                {row.managerAt ? ` · ${fmtDateTime(row.managerAt)}` : ""}
              </p>
            ) : null}
            {row.accountantNote ? (
              <p className="mt-2 rounded-xl bg-paper px-3 py-2 text-sm">
                Бухгалтерия: {row.accountantNote}
                {row.paidAt ? ` · ${fmtDateTime(row.paidAt)}` : ""}
                {row.accountant ? ` · ${fullName(row.accountant)}` : ""}
              </p>
            ) : null}
          </Card>
          {row.files.length > 0 ? (
            <Card>
              <h2 className="font-serif text-xl text-navy">Вложения</h2>
              <ul className="mt-3 divide-y divide-line">
                {row.files.map((f) => (
                  <li key={f.id} className="py-2">
                    <a className="text-gold underline" href={`/api/files/${f.fileId}`}>
                      {byId[f.fileId]?.originalName || "файл"}
                    </a>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
        <Card>
          <FundActions
            id={row.id}
            status={row.status}
            isAuthor={row.authorId === user.id}
            isManager={row.managerId === user.id || can(user, "finance.approve")}
            isAccountant={["accountant", "admin", "superadmin"].includes(user.roleCode)}
            purpose={row.purpose}
            amount={kopecksToRub(row.amount)}
            details={row.details}
            payee={row.payee}
            neededAt={toDateInput(row.neededAt)}
            managerId={row.managerId || ""}
            managers={managers.map((p) => ({
              id: p.id,
              name: `${fullName(p)}${p.position?.name ? ` — ${p.position.name}` : ""}`,
            }))}
            payees={people.map((p) => ({
              id: p.id,
              label: fullName(p),
              hint: [p.position?.name, p.department?.name].filter(Boolean).join(" · "),
            }))}
            advanceReportId={row.advanceReportId}
          />
        </Card>
      </div>
    </div>
  );
}
