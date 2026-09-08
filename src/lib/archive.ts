import { mkdir, writeFile, stat } from "fs/promises";
import path from "path";
import { prisma } from "./prisma";
import { readStoredFile, saveUpload } from "./files";
import { shareRoot } from "./prod";
import { officeYmd } from "./dates";
import { formatMoney } from "./money";

function archiveLogin(login: string) {
  return login.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 64) || "user";
}

function safeFilePart(name: string) {
  const base = path.basename(name || "file");
  return base.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/\s+/g, " ").trim().slice(0, 80) || "file";
}

function relFromShare(abs: string) {
  const root = shareRoot().replace(/\\/g, "/");
  const norm = abs.replace(/\\/g, "/");
  if (norm.toLowerCase().startsWith(root.toLowerCase())) {
    return norm.slice(root.length).replace(/^\//, "");
  }
  return norm;
}

async function copyToShare(opts: {
  login: string;
  occurredAt: Date;
  kind: string;
  originalName: string;
  buffer: Buffer;
}): Promise<string> {
  const ymd = officeYmd(opts.occurredAt);
  const year = ymd.slice(0, 4);
  const dir = path.join(shareRoot(), "Archive", archiveLogin(opts.login), year);
  await mkdir(/* turbopackIgnore: true */ dir, { recursive: true });
  const destName = `${ymd}_${opts.kind}_${safeFilePart(opts.originalName)}`;
  let abs = path.join(/* turbopackIgnore: true */ dir, destName);
  try {
    await stat(/* turbopackIgnore: true */ abs);
    const ext = path.extname(destName);
    const stem = ext ? destName.slice(0, -ext.length) : destName;
    abs = path.join(/* turbopackIgnore: true */ dir, `${stem}_${Date.now().toString(36)}${ext}`);
  } catch {
    // new file
  }
  await writeFile(/* turbopackIgnore: true */ abs, opts.buffer);
  return abs;
}

export async function indexPersonDocument(opts: {
  userId: string;
  kind: string;
  title: string;
  occurredAt: Date | null | undefined;
  source: string;
  sourceId: string;
  fileId?: string | null;
  buffer?: Buffer;
  originalName?: string;
  mimeType?: string;
  link?: string;
  meta?: Record<string, unknown>;
  replaceFile?: boolean;
}): Promise<{ id: string; archivePath: string; fileId: string } | null> {
  try {
    return await indexInner(opts);
  } catch (e) {
    console.error("archive.index", opts.kind, opts.source, opts.sourceId, e);
    return null;
  }
}

async function indexInner(opts: {
  userId: string;
  kind: string;
  title: string;
  occurredAt: Date | null | undefined;
  source: string;
  sourceId: string;
  fileId?: string | null;
  buffer?: Buffer;
  originalName?: string;
  mimeType?: string;
  link?: string;
  meta?: Record<string, unknown>;
  replaceFile?: boolean;
}) {
  const occurredAt = opts.occurredAt && !Number.isNaN(opts.occurredAt.getTime()) ? opts.occurredAt : new Date();
  const user = await prisma.user.findUnique({ where: { id: opts.userId }, select: { id: true, login: true } });
  if (!user) return null;

  const existing = await prisma.personDocument.findUnique({
    where: {
      userId_kind_source_sourceId: {
        userId: opts.userId,
        kind: opts.kind,
        source: opts.source,
        sourceId: opts.sourceId,
      },
    },
  });

  let fileId = opts.fileId || existing?.fileId || "";
  let buffer = opts.buffer;
  let originalName = opts.originalName || "";

  if (!buffer && fileId) {
    const stored = await readStoredFile(fileId);
    if (stored) {
      buffer = stored.buffer;
      originalName = originalName || stored.rec.originalName;
    }
  }

  if (buffer && !fileId) {
    const saved = await saveUpload({
      buffer,
      originalName: originalName || `${opts.kind}.bin`,
      declaredMime: opts.mimeType || "application/octet-stream",
      userId: opts.userId,
      maxBytes: 40 * 1024 * 1024,
    });
    fileId = saved.id;
    originalName = saved.originalName;
  }

  let archivePath = existing?.archivePath || "";
  if (buffer && (!archivePath || opts.replaceFile)) {
    try {
      const abs = await copyToShare({
        login: user.login,
        occurredAt,
        kind: opts.kind,
        originalName: originalName || "file",
        buffer,
      });
      archivePath = relFromShare(abs);
    } catch (e) {
      console.error("archive.copy", user.login, opts.kind, e);
    }
  }

  const data = {
    title: opts.title.slice(0, 300),
    occurredAt,
    fileId,
    archivePath,
    link: opts.link || existing?.link || "",
    metaJson: JSON.stringify(opts.meta || {}),
  };

  const row = existing
    ? await prisma.personDocument.update({ where: { id: existing.id }, data })
    : await prisma.personDocument.create({
        data: {
          userId: opts.userId,
          kind: opts.kind,
          source: opts.source,
          sourceId: opts.sourceId,
          ...data,
        },
      });

  return { id: row.id, archivePath: row.archivePath, fileId: row.fileId };
}

export async function archiveReceipt(
  row: {
    id: string;
    reportId: string;
    sourceFileId: string;
    occurredAt: Date | null;
    createdAt: Date;
    amount: number;
    merchant: string;
    fn: string;
    fd: string;
    fp: string;
    files?: { fileId: string }[];
  },
  userId: string,
) {
  const ids = [row.sourceFileId, ...(row.files || []).map((f) => f.fileId)].filter(Boolean);
  const unique = [...new Set(ids)];
  let last = null;
  for (let i = 0; i < unique.length; i++) {
    last = await indexPersonDocument({
      userId,
      kind: "receipt",
      title: `Чек${row.merchant ? ` · ${row.merchant}` : ""} · ${formatMoney(row.amount)}${unique.length > 1 ? ` (${i + 1})` : ""}`,
      occurredAt: row.occurredAt || row.createdAt,
      source: "receipt",
      sourceId: i === 0 ? row.id : `${row.id}:${unique[i]}`,
      fileId: unique[i],
      link: `/advances/${row.reportId}`,
      meta: {
        amount: row.amount,
        merchant: row.merchant,
        fn: row.fn,
        fd: row.fd,
        fp: row.fp,
        reportId: row.reportId,
      },
    });
  }
  return last;
}

export async function archiveCircular(opts: {
  documentId: string;
  number: string;
  title: string;
  occurredAt: Date;
  originalFileId: string;
  userIds: string[];
}) {
  const title = `${opts.number} · ${opts.title}`;
  for (const userId of Array.from(new Set(opts.userIds))) {
    await indexPersonDocument({
      userId,
      kind: "circular",
      title,
      occurredAt: opts.occurredAt,
      source: "document",
      sourceId: opts.documentId,
      fileId: opts.originalFileId,
      link: `/documents/${opts.documentId}`,
      meta: { number: opts.number },
    });
  }
}

export async function archiveAck(opts: {
  documentId: string;
  number: string;
  title: string;
  userId: string;
  ackedAt: Date;
  originalFileId?: string;
}) {
  return indexPersonDocument({
    userId: opts.userId,
    kind: "ack",
    title: `Ознакомлен · ${opts.number} · ${opts.title}`,
    occurredAt: opts.ackedAt,
    source: "document",
    sourceId: opts.documentId,
    fileId: opts.originalFileId,
    link: `/documents/${opts.documentId}`,
  });
}

export async function archiveSigned(opts: {
  documentId: string;
  number: string;
  title: string;
  userId: string;
  signedAt: Date;
  signedFileId: string;
}) {
  return indexPersonDocument({
    userId: opts.userId,
    kind: "signed",
    title: `Подписан · ${opts.number} · ${opts.title}`,
    occurredAt: opts.signedAt,
    source: "document",
    sourceId: opts.documentId,
    fileId: opts.signedFileId,
    link: `/documents/${opts.documentId}`,
  });
}

export async function archiveAdvance(reportId: string) {
  const report = await prisma.advanceReport.findFirst({
    where: { id: reportId, deletedAt: null },
  });
  if (!report) return null;
  let buffer: Buffer | undefined;
  try {
    const { renderAdvancePdf } = await import("./pdf/render");
    buffer = await renderAdvancePdf(report.id);
  } catch (e) {
    console.error("archive.advance.pdf", report.id, e);
  }
  return indexPersonDocument({
    userId: report.userId,
    kind: "advance",
    title: `${report.number} · ${report.purpose || "Авансовый отчёт"}`,
    occurredAt: report.reportDate || report.createdAt,
    source: "advance",
    sourceId: report.id,
    buffer,
    originalName: `${report.number}.pdf`,
    mimeType: "application/pdf",
    link: `/advances/${report.id}`,
    meta: { number: report.number, status: report.status },
    replaceFile: true,
  });
}

export async function archiveFund(fundId: string, extraUserIds: string[] = []) {
  const row = await prisma.fundRequest.findFirst({
    where: { id: fundId, deletedAt: null },
    include: { purchaseRequest: { select: { ahoUserId: true } } },
  });
  if (!row) return null;
  let buffer: Buffer | undefined;
  let number = row.number;
  let fileId = "";
  try {
    const { buildFundPdfById } = await import("./pdf/fund-build");
    const pdf = await buildFundPdfById(row.id);
    if (pdf) {
      buffer = pdf.buffer;
      number = pdf.number;
      const saved = await saveUpload({
        buffer,
        originalName: `${number}.pdf`,
        declaredMime: "application/pdf",
        userId: row.authorId,
        maxBytes: 20 * 1024 * 1024,
      });
      fileId = saved.id;
    }
  } catch (e) {
    console.error("archive.fund.pdf", row.id, e);
  }
  const users = Array.from(
    new Set(
      [row.authorId, row.managerId, row.purchaseRequest?.ahoUserId, ...extraUserIds].filter(Boolean) as string[],
    ),
  );
  let last = null;
  for (const userId of users) {
    last = await indexPersonDocument({
      userId,
      kind: "fund",
      title: `${number} · ${row.purpose}`,
      occurredAt: row.paidAt || row.createdAt,
      source: "fund",
      sourceId: row.id,
      fileId,
      buffer,
      originalName: `${number}.pdf`,
      mimeType: "application/pdf",
      link: `/funds/${row.id}`,
      meta: { number, amount: row.amount, status: row.status, paidAt: row.paidAt },
      replaceFile: Boolean(row.paidAt),
    });
  }
  for (const f of await prisma.fundRequestFile.findMany({ where: { requestId: row.id } })) {
    await indexPersonDocument({
      userId: row.authorId,
      kind: "fund",
      title: `${number} · вложение`,
      occurredAt: f.createdAt,
      source: "fund_file",
      sourceId: f.id,
      fileId: f.fileId,
      link: `/funds/${row.id}`,
    });
  }
  return last;
}

export async function archiveHrLetter(hrId: string, replaceFile = false) {
  const row = await prisma.hrRequest.findUnique({ where: { id: hrId } });
  if (!row) return null;
  let buffer: Buffer | undefined;
  let title = row.title;
  let number = row.number;
  let fileId = "";
  try {
    const { buildHrPdfById } = await import("./pdf/hr-build");
    const pdf = await buildHrPdfById(row.id);
    if (pdf) {
      buffer = pdf.buffer;
      title = pdf.title;
      number = pdf.number;
      const saved = await saveUpload({
        buffer,
        originalName: `${number}.pdf`,
        declaredMime: "application/pdf",
        userId: row.authorId,
        maxBytes: 20 * 1024 * 1024,
      });
      fileId = saved.id;
    }
  } catch (e) {
    console.error("archive.hr.pdf", row.id, e);
  }
  const users = [row.authorId, row.managerId];
  let last = null;
  for (const userId of users) {
    last = await indexPersonDocument({
      userId,
      kind: "hr",
      title: `${number} · ${title}`,
      occurredAt: row.createdAt,
      source: "hr",
      sourceId: row.id,
      fileId,
      buffer,
      originalName: `${number}.pdf`,
      mimeType: "application/pdf",
      link: `/statements/${row.id}`,
      meta: { number, type: row.type, status: row.status },
      replaceFile,
    });
  }
  return last;
}

export async function archiveHrScan(hrId: string) {
  const row = await prisma.hrRequest.findUnique({ where: { id: hrId } });
  if (!row || !row.signedFileId) return null;
  const users = [row.authorId, row.managerId];
  let last = null;
  for (const userId of users) {
    last = await indexPersonDocument({
      userId,
      kind: "hr_scan",
      title: `Скан · ${row.number} · ${row.title}`,
      occurredAt: row.updatedAt,
      source: "hr",
      sourceId: row.id,
      fileId: row.signedFileId,
      link: `/statements/${row.id}`,
    });
  }
  return last;
}

export async function archivePurchase(purchaseId: string) {
  const row = await prisma.purchaseRequest.findUnique({
    where: { id: purchaseId },
    include: { items: true },
  });
  if (!row) return null;
  const users = [row.authorId, row.ahoUserId].filter(Boolean) as string[];
  for (const userId of users) {
    await indexPersonDocument({
      userId,
      kind: "purchase",
      title: `${row.number} · ${row.title}`,
      occurredAt: row.createdAt,
      source: "purchase",
      sourceId: row.id,
      link: `/requests/${row.id}`,
      meta: { number: row.number, category: row.category, status: row.status },
    });
  }
  for (const item of row.items) {
    if (!item.fileId) continue;
    for (const userId of users) {
      await indexPersonDocument({
        userId,
        kind: "purchase",
        title: `${row.number} · ${item.name}`,
        occurredAt: row.createdAt,
        source: "purchase_item",
        sourceId: item.id,
        fileId: item.fileId,
        link: `/requests/${row.id}`,
      });
    }
  }
}

export async function backfillArchive(opts: { skipPdf?: boolean } = {}) {
  const skipPdf = opts.skipPdf ?? process.env.ARCHIVE_SKIP_PDF === "1";
  const stats = {
    receipts: 0,
    circular: 0,
    ack: 0,
    signed: 0,
    advance: 0,
    fund: 0,
    hr: 0,
    hrScan: 0,
    purchase: 0,
  };

  const receipts = await prisma.receipt.findMany({ include: { report: true } });
  for (const r of receipts) {
    if (r.report.deletedAt) continue;
    if (await archiveReceipt(r, r.report.userId)) stats.receipts += 1;
  }

  const docs = await prisma.document.findMany({
    where: { deletedAt: null },
    include: { recipients: true },
  });
  for (const d of docs) {
    const userIds = [d.authorId, ...d.recipients.map((r) => r.userId)];
    await archiveCircular({
      documentId: d.id,
      number: d.number,
      title: d.title,
      occurredAt: d.createdAt,
      originalFileId: d.originalFileId,
      userIds,
    });
    stats.circular += 1;
    for (const rec of d.recipients) {
      if (rec.ackedAt) {
        await archiveAck({
          documentId: d.id,
          number: d.number,
          title: d.title,
          userId: rec.userId,
          ackedAt: rec.ackedAt,
          originalFileId: d.originalFileId,
        });
        stats.ack += 1;
      }
      if (rec.signedAt && rec.signedFileId) {
        await archiveSigned({
          documentId: d.id,
          number: d.number,
          title: d.title,
          userId: rec.userId,
          signedAt: rec.signedAt,
          signedFileId: rec.signedFileId,
        });
        stats.signed += 1;
      }
    }
  }

  if (!skipPdf) {
    const advances = await prisma.advanceReport.findMany({
      where: { deletedAt: null, status: { not: "draft" } },
    });
    for (const a of advances) {
      if (await archiveAdvance(a.id)) stats.advance += 1;
    }

    const funds = await prisma.fundRequest.findMany({
      where: { deletedAt: null, status: { not: "draft" } },
    });
    for (const f of funds) {
      if (await archiveFund(f.id)) stats.fund += 1;
    }

    const hrs = await prisma.hrRequest.findMany();
    for (const h of hrs) {
      if (await archiveHrLetter(h.id)) stats.hr += 1;
      if (h.signedFileId && (await archiveHrScan(h.id))) stats.hrScan += 1;
    }
  } else {
    const advances = await prisma.advanceReport.findMany({
      where: { deletedAt: null, status: { not: "draft" } },
    });
    for (const a of advances) {
      if (
        await indexPersonDocument({
          userId: a.userId,
          kind: "advance",
          title: `${a.number} · ${a.purpose || "Авансовый отчёт"}`,
          occurredAt: a.reportDate || a.createdAt,
          source: "advance",
          sourceId: a.id,
          link: `/advances/${a.id}`,
          meta: { number: a.number, status: a.status },
        })
      ) {
        stats.advance += 1;
      }
    }
    const funds = await prisma.fundRequest.findMany({
      where: { deletedAt: null, status: { not: "draft" } },
    });
    for (const f of funds) {
      const users = [f.authorId, f.managerId].filter(Boolean) as string[];
      for (const userId of users) {
        await indexPersonDocument({
          userId,
          kind: "fund",
          title: `${f.number} · ${f.purpose}`,
          occurredAt: f.paidAt || f.createdAt,
          source: "fund",
          sourceId: f.id,
          link: `/funds/${f.id}`,
          meta: { number: f.number, amount: f.amount, status: f.status },
        });
      }
      stats.fund += 1;
    }
    const hrs = await prisma.hrRequest.findMany();
    for (const h of hrs) {
      for (const userId of [h.authorId, h.managerId]) {
        await indexPersonDocument({
          userId,
          kind: "hr",
          title: `${h.number} · ${h.title}`,
          occurredAt: h.createdAt,
          source: "hr",
          sourceId: h.id,
          link: `/statements/${h.id}`,
          meta: { number: h.number, type: h.type, status: h.status },
        });
      }
      stats.hr += 1;
      if (h.signedFileId && (await archiveHrScan(h.id))) stats.hrScan += 1;
    }
  }

  const purchases = await prisma.purchaseRequest.findMany({
    where: { status: { not: "draft" } },
  });
  for (const p of purchases) {
    await archivePurchase(p.id);
    stats.purchase += 1;
  }

  return stats;
}
