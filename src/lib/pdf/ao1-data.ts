import { prisma } from "../prisma";
import { readStoredFile } from "../files";
import { fullName, shortName } from "../names";
import { fmtDate, officeDateParts } from "../dates";
import { orgCodesLine, orgNameFull } from "../org";
import { sumInWords, rubKopText, splitRubKop } from "./money-words";
import { filePreviewPngs, pngDataUrl } from "./raster";
import type { Ao1Data } from "./ao1";

export type Ao1Bundle = {
  data: Ao1Data;
  words: string;
  issuedStr: string;
  spentStr: string;
  restStr: string;
  remainder: boolean;
  docs: string;
  sheets: string;
};

export async function loadAo1Bundle(reportId: string): Promise<Ao1Bundle> {
  const report = await prisma.advanceReport.findFirst({
    where: { id: reportId },
    include: {
      receipts: { include: { files: { orderBy: { sortOrder: "asc" } } } },
      user: { include: { position: true, department: true } },
    },
  });
  if (!report) throw new Error("Отчёт не найден");
  const org = await prisma.organization.findFirst();
  const spent = report.receipts.reduce((s, r) => s + r.amount, 0);
  const when = report.reportDate || new Date();
  const parts = officeDateParts(when);

  const images: Ao1Data["images"] = [];
  for (const rec of report.receipts) {
    const ids = [rec.sourceFileId, ...rec.files.map((f) => f.fileId)].filter(Boolean);
    let n = 0;
    for (const fid of [...new Set(ids)]) {
      n += 1;
      const file = await readStoredFile(fid).catch(() => null);
      const base = `${rec.merchant || rec.note || "Документ"}${ids.length > 1 ? ` · ${n}` : ""} · ${fmtDate(rec.occurredAt)}`;
      if (!file) {
        images.push({ title: base });
        continue;
      }
      const pages = await filePreviewPngs({
        buffer: file.buffer,
        mimeType: file.rec.mimeType,
        originalName: file.rec.originalName,
      });
      if (pages.length === 0) {
        images.push({ title: `${base} · ${file.rec.originalName}` });
        continue;
      }
      pages.forEach((page, pi) => {
        images.push({
          title: pages.length > 1 ? `${base} · стр. ${pi + 1}` : base,
          dataUrl: pngDataUrl(page.buffer, page.mime),
        });
      });
    }
  }

  const data: Ao1Data = {
    orgName: orgNameFull(org),
    orgCodes: orgCodesLine(org),
    orgOkpo: org?.okpo || "",
    directorTitle: org?.directorTitle || "Генеральный директор",
    directorName: org?.directorName || "",
    accountantName: org?.accountantName || "",
    debitAccount: org?.debitAccount || "",
    number: report.number,
    date: parts.date,
    day: parts.day,
    month: parts.month,
    year2: parts.year2,
    employee: fullName(report.user),
    employeeShort: shortName(report.user),
    position: report.user.position?.name || "",
    department: report.user.department?.name || "Офис",
    personnelNumber: report.user.personnelNumber,
    purpose: report.purpose || "Хоз расходы",
    issued: report.issuedAmount,
    spent,
    receipts: report.receipts.map((r, i) => ({
      n: i + 1,
      date: r.occurredAt ? officeDateParts(r.occurredAt).date : "",
      number: r.fd || r.fp || "",
      name: r.merchant || r.note || "Документ",
      amount: r.amount,
    })),
    images,
  };

  const rest = splitRubKop(data.issued - data.spent);
  const spentP = rubKopText(spent);
  const issuedP = rubKopText(data.issued);
  return {
    data,
    words: sumInWords(spent),
    issuedStr: `${issuedP.rub}.${issuedP.kop}`,
    spentStr: `${spentP.rub}.${spentP.kop}`,
    restStr: `${rest.rub}.${String(rest.kop).padStart(2, "0")}`,
    remainder: data.issued - data.spent >= 0,
    docs: String(data.receipts.length),
    sheets: String(2 + data.images.filter((i) => i.dataUrl).length),
  };
}
