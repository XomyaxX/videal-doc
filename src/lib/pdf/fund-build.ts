import { prisma } from "@/lib/prisma";
import { renderFundPdf } from "@/lib/pdf/render";
import { officeYmd } from "@/lib/dates";
import { shortNamePlain } from "@/lib/names";
import { orgLetterhead, orgNameShort } from "@/lib/org";
import { dueDateParts, issuedYmd, reportDueYmd } from "@/lib/report-period";
import { formatMoney } from "@/lib/money";

function shortFromPayee(payee: string) {
  const parts = payee.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  const last = parts[0];
  const i = (parts[1]?.[0] || "").toUpperCase();
  const m = (parts[2]?.[0] || "").toUpperCase();
  return `${last} ${i}${m}`.trim();
}

export async function buildFundPdfById(id: string): Promise<{ buffer: Buffer; number: string } | null> {
  const row = await prisma.fundRequest.findFirst({
    where: { id, deletedAt: null },
    include: {
      author: { include: { position: true, department: true } },
      manager: true,
      accountant: true,
      purchaseRequest: {
        include: { ahoUser: { include: { position: true, department: true } } },
      },
    },
  });
  if (!row) return null;
  const aho = row.purchaseRequest?.ahoUser;
  const fromPerson = aho || row.author;
  const fromPurchase = Boolean(row.purchaseRequest);
  const authorRole = fromPurchase
    ? aho?.position?.name || aho?.department?.name || "Специалист АХО"
    : fromPerson.position?.name || fromPerson.department?.name || "";
  const authorShort = aho
    ? shortNamePlain(aho)
    : fromPurchase && row.payee
      ? shortFromPayee(row.payee)
      : shortNamePlain(row.author);
  const department = fromPurchase
    ? aho?.department?.name || "Административно-хозяйственный отдел"
    : fromPerson.department?.name || "";
  const org = await prisma.organization.findFirst();
  const prev = await prisma.fundRequest.aggregate({
    where: {
      authorId: row.authorId,
      status: "paid",
      deletedAt: null,
      advanceReportId: null,
      id: { not: row.id },
    },
    _sum: { amount: true },
  });
  const debt = prev._sum.amount || 0;
  const due = dueDateParts(reportDueYmd(issuedYmd(row)));
  const sign = dueDateParts(officeYmd(row.createdAt));
  const issueDate = row.paidAt || row.neededAt;
  const issue = issueDate ? dueDateParts(officeYmd(issueDate)) : null;
  const acc = row.paidAt && row.accountant ? dueDateParts(officeYmd(row.paidAt)) : null;
  const buffer = await renderFundPdf({
    directorTitle: org?.directorTitle || "Генеральный директор",
    orgName: orgNameShort(org),
    letterhead: orgLetterhead(org),
    directorName: org?.directorName || "",
    department,
    authorRole,
    authorShort,
    amount: row.amount,
    purpose: row.purpose,
    details: row.details,
    outstanding: debt > 0 ? `задолженность ${formatMoney(debt)}` : "",
    dueDay: due.day,
    dueMonth: due.month,
    dueYear: due.year,
    issueDay: issue?.day || "",
    issueMonth: issue?.month || "",
    issueYear: issue?.year || "",
    signDay: sign.day,
    signMonth: sign.month,
    signYear: sign.year,
    managerMark:
      row.status === "to_pay" || row.status === "paid"
        ? `Согласовано${row.manager ? ` (${shortNamePlain(row.manager)})` : ""}`
        : row.status === "rejected"
          ? `Отклонено${row.managerNote ? `: ${row.managerNote}` : ""}`
          : "",
    accountantShort: row.accountant ? shortNamePlain(row.accountant) : "",
    accountantDay: acc?.day || "",
    accountantMonth: acc?.month || "",
    accountantYear: acc?.year || "",
  });
  return { buffer, number: row.number };
}
