import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { userCan, type SessionUser } from "@/lib/types";
import { prisma } from "@/lib/prisma";
import { saveUpload } from "@/lib/files";
import { receiptFingerprint } from "@/lib/qr";
import { rubToKopecks } from "@/lib/money";
import { archiveReceipt } from "@/lib/archive";
import { syncAdvanceReportDate } from "@/lib/pdf/ao1-data";

async function loadEditable(sessionUser: SessionUser, id: string, receiptId: string) {
  const report = await prisma.advanceReport.findFirst({ where: { id, deletedAt: null } });
  if (!report) return { ok: false as const, res: NextResponse.json({ error: "Отчёт не найден" }, { status: 404 }) };
  if (report.userId !== sessionUser.id && !userCan(sessionUser, "finance.view_all")) {
    return { ok: false as const, res: NextResponse.json({ error: "Чужой отчёт" }, { status: 403 }) };
  }
  if (!["draft", "rework"].includes(report.status)) {
    return { ok: false as const, res: NextResponse.json({ error: "Отчёт уже на согласовании — позицию не изменить" }, { status: 400 }) };
  }
  const row = await prisma.receipt.findFirst({
    where: { id: receiptId, reportId: id },
    include: { files: { orderBy: { sortOrder: "asc" } } },
  });
  if (!row) return { ok: false as const, res: NextResponse.json({ error: "Нет такой позиции" }, { status: 404 }) };
  return { ok: true as const, report, row };
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; receiptId: string }> }) {
  const session = await getSession();
  if (!session || !userCan(session.user, "finance.create")) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const { id, receiptId } = await ctx.params;
  const loaded = await loadEditable(session.user, id, receiptId);
  if (!loaded.ok) return loaded.res;
  const { report, row } = loaded;

  const form = await req.formData();
  const merchant = String(form.get("merchant") ?? row.merchant).trim();
  if (!merchant) return NextResponse.json({ error: "Укажите, что купили" }, { status: 400 });

  const amountRaw = String(form.get("amount") ?? "").trim();
  const amount = amountRaw ? rubToKopecks(amountRaw) : row.amount;
  if (amount <= 0) return NextResponse.json({ error: "Укажите сумму расхода" }, { status: 400 });

  const occurredRaw = String(form.get("occurredAt") || "");
  const occurredAt = occurredRaw ? new Date(occurredRaw) : row.occurredAt;
  if (occurredRaw && Number.isNaN(occurredAt?.getTime() ?? NaN)) {
    return NextResponse.json({ error: "Некорректная дата" }, { status: 400 });
  }

  const fd = form.has("fd") ? String(form.get("fd") || "").trim() : row.fd;
  const note = form.has("note") ? String(form.get("note") || "").trim() : row.note;

  const fpKey = receiptFingerprint({ fn: row.fn, fd, fp: row.fp });
  if (fpKey) {
    const siblings = await prisma.receipt.findMany({ where: { reportId: id, NOT: { id: row.id } } });
    if (siblings.some((r) => receiptFingerprint(r) === fpKey)) {
      return NextResponse.json({ error: "Этот чек уже есть в отчёте (тот же ФН/ФД/ФП)" }, { status: 400 });
    }
  }

  const uploads = [...form.getAll("file"), ...form.getAll("files")].filter(
    (f): f is File => f instanceof File && f.size > 0,
  );
  const saved: { id: string }[] = [];
  if (uploads.length > 0) {
    const settings = await prisma.appSettings.findUnique({ where: { id: "default" } });
    const maxBytes = (settings?.maxUploadMb || 32) * 1024 * 1024;
    try {
      for (const file of uploads) {
        saved.push(
          await saveUpload({
            buffer: Buffer.from(await file.arrayBuffer()),
            originalName: file.name,
            declaredMime: file.type,
            userId: session.user.id,
            maxBytes,
          }),
        );
      }
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Файл" }, { status: 400 });
    }
  }

  const maxSort = row.files.reduce((m, f) => Math.max(m, f.sortOrder), -1);
  const updated = await prisma.receipt.update({
    where: { id: row.id },
    data: {
      merchant,
      amount,
      occurredAt,
      fd,
      note,
      files: saved.length
        ? { create: saved.map((f, i) => ({ fileId: f.id, sortOrder: maxSort + 1 + i })) }
        : undefined,
    },
    include: { files: { orderBy: { sortOrder: "asc" } } },
  });

  await archiveReceipt(
    { ...updated, files: updated.files.map((f) => ({ fileId: f.fileId })) },
    report.userId,
  );
  await syncAdvanceReportDate(id);
  return NextResponse.json({ ok: true, id: updated.id, files: updated.files.length });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string; receiptId: string }> }) {
  const session = await getSession();
  if (!session || !userCan(session.user, "finance.create")) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const { id, receiptId } = await ctx.params;
  const loaded = await loadEditable(session.user, id, receiptId);
  if (!loaded.ok) return loaded.res;
  await prisma.receipt.delete({ where: { id: loaded.row.id } });
  await syncAdvanceReportDate(id);
  return NextResponse.json({ ok: true });
}
