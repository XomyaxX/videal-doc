import { prisma } from "./prisma";
import { sendMail, siteUrl } from "./mail";
import { readStoredFile } from "./files";
import { renderAdvancePdf } from "./pdf/render";
import { renderAdvanceXlsx } from "./pdf/ao1-xlsx";
import { formatMoney } from "./money";
import { fullName } from "./names";

export const DEFAULT_ACCOUNTANT_EMAIL = "vidial_kiv@mail.ru";

export async function accountantMailbox() {
  const s = await prisma.appSettings.findUnique({
    where: { id: "default" },
    select: { accountantEmail: true },
  });
  return (s?.accountantEmail || DEFAULT_ACCOUNTANT_EMAIL).trim();
}

export async function mailAdvanceToAccountant(opts: {
  reportId: string;
  fromUserId: string;
}): Promise<{ ok: boolean; error?: string; to?: string; from?: string }> {
  const to = await accountantMailbox();
  if (!to || !to.includes("@")) return { ok: false, error: "Не указана почта бухгалтера в настройках" };

  const report = await prisma.advanceReport.findFirst({
    where: { id: opts.reportId, deletedAt: null },
    include: {
      receipts: { include: { files: { orderBy: { sortOrder: "asc" } } } },
      user: true,
      fundRequests: { select: { number: true, purpose: true } },
    },
  });
  if (!report) return { ok: false, error: "Нет отчёта" };

  const spent = report.receipts.reduce((s, r) => s + r.amount, 0);
  const pdf = await renderAdvancePdf(report.id);
  const xlsx = await renderAdvanceXlsx(report.id);

  const attachments: { filename: string; content: Buffer; contentType?: string }[] = [
    { filename: `${report.number}.pdf`, content: pdf, contentType: "application/pdf" },
    {
      filename: `${report.number}.xlsx`,
      content: xlsx,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  ];

  let extra = 0;
  for (const r of report.receipts) {
    const ids = [r.sourceFileId, ...r.files.map((f) => f.fileId)].filter(Boolean);
    for (const fid of [...new Set(ids)]) {
      const file = await readStoredFile(fid);
      if (!file) continue;
      if (file.buffer.length > 8 * 1024 * 1024) continue;
      extra += file.buffer.length;
      if (extra > 18 * 1024 * 1024) break;
      attachments.push({
        filename: file.rec.originalName || `чек-${attachments.length}.jpg`,
        content: file.buffer,
        contentType: file.rec.mimeType,
      });
    }
    if (extra > 18 * 1024 * 1024) break;
  }

  const funds = report.fundRequests.length
    ? `\nЗапросы средств: ${report.fundRequests.map((f) => `${f.number} (${f.purpose})`).join(", ")}`
    : "";

  const text = [
    `Авансовый отчёт ${report.number}`,
    `Сотрудник: ${fullName(report.user)}`,
    report.purpose ? `Назначение: ${report.purpose}` : "",
    `Получено под отчёт: ${formatMoney(report.issuedAmount)}`,
    `Расходы: ${formatMoney(spent)}`,
    funds.trim(),
    "",
    `В Доке: ${siteUrl(`/advances/${report.id}`)}`,
    "",
    "Во вложении АО-1 (PDF и Excel) и сканы чеков.",
  ]
    .filter((line) => line !== "")
    .join("\n");

  return sendMail({
    to,
    fromUserId: opts.fromUserId,
    subject: `Авансовый отчёт ${report.number} · ${fullName(report.user)}`,
    text,
    attachments,
  }).then((r) => ({ ...r, to }));
}
