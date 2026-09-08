import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, PageHeader, Pill } from "@/components/ui";
import { ADVANCE_STATUS } from "@/lib/status";
import { formatMoney, kopecksToRub } from "@/lib/money";
import { fmtDateTime } from "@/lib/dates";
import { fullName } from "@/lib/names";
import { AdvancePanel } from "./AdvancePanel";
import { AddReceipts } from "./AddReceipts";
import { RemoveReceipt } from "./RemoveReceipt";
import { USER_SAFE_ORG_SELECT } from "@/lib/user-public";

export default async function AdvancePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const report = await prisma.advanceReport.findFirst({
    where: { id, deletedAt: null },
    include: {
      receipts: { include: { files: { orderBy: { sortOrder: "asc" } } } },
      fundRequests: true,
      user: { select: USER_SAFE_ORG_SELECT },
    },
  });
  if (!report) notFound();
  if (report.userId !== user.id && !can(user, "finance.view_all")) notFound();

  const spent = report.receipts.reduce((s, r) => s + r.amount, 0);
  const st = ADVANCE_STATUS[report.status] || ADVANCE_STATUS.draft;
  const canEdit = report.userId === user.id && ["draft", "rework"].includes(report.status);
  const settings = await prisma.appSettings.findUnique({
    where: { id: "default" },
    select: { accountantEmail: true },
  });

  return (
    <div>
      <Link href="/finance" className="mb-2 inline-block text-sm text-muted hover:text-gold">
        ← Финансы
      </Link>
      <PageHeader
        title={report.number}
        subtitle={`${fullName(report.user)} · ${report.user.position?.name || ""}`}
        actions={<Pill tone={st.tone}>{st.label}</Pill>}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          {report.fundRequests.length > 0 ? (
            <Card>
              <h2 className="font-serif text-lg text-navy">Запросы средств в этом отчёте</h2>
              <ul className="mt-2 divide-y divide-line text-sm">
                {report.fundRequests.map((f) => (
                  <li key={f.id} className="py-2">
                    <Link href={`/funds/${f.id}`} className="hover:text-gold">
                      {f.number} · {f.purpose} · {formatMoney(f.amount)}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
          {canEdit ? <AddReceipts reportId={report.id} /> : null}
          {report.receipts.length === 0 && !canEdit ? (
            <Card>Пока нет расходов.</Card>
          ) : (
            report.receipts.map((r) => (
              <Card key={r.id}>
                <div className="flex gap-4">
                  {r.sourceFileId ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/files/${r.sourceFileId}?preview=1`}
                      alt=""
                      className="h-24 w-20 rounded-lg object-cover bg-paper"
                    />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-semibold">{r.merchant || "Расход"}</div>
                      {canEdit ? <RemoveReceipt reportId={report.id} receiptId={r.id} /> : null}
                    </div>
                    <div className="text-sm text-muted">{fmtDateTime(r.occurredAt)}</div>
                    <div className="text-lg">{formatMoney(r.amount)}</div>
                    <div className="text-xs text-muted">
                      {r.fn ? `ФН ${r.fn} · ФД ${r.fd || "—"} · ФП ${r.fp || "—"}` : r.fd ? `№ ${r.fd}` : "без QR"}
                    </div>
                    {r.note ? <div className="text-sm">{r.note}</div> : null}
                    {(() => {
                      const ids = [r.sourceFileId, ...r.files.map((f) => f.fileId)].filter(Boolean);
                      const unique = [...new Set(ids)];
                      if (unique.length === 0) return null;
                      return (
                        <div className="mt-1 flex flex-wrap gap-2">
                          {unique.map((fid, i) => (
                            <a key={fid} className="text-xs text-gold underline" href={`/api/files/${fid}`}>
                              {unique.length === 1 ? "вложение" : `документ ${i + 1}`}
                            </a>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
        <Card>
          <div className="text-sm text-muted">Итого по расходам</div>
          <div className="font-serif text-3xl text-navy">{formatMoney(spent)}</div>
          <div className="mt-1 text-sm text-muted">получено {formatMoney(report.issuedAmount)}</div>
          <div className="mt-4">
            <AdvancePanel
              id={report.id}
              status={report.status}
              purpose={report.purpose}
              issued={kopecksToRub(report.issuedAmount)}
              canEdit={canEdit}
              canApprove={can(user, "finance.approve")}
              accountantEmail={settings?.accountantEmail || "vidial_kiv@mail.ru"}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}
