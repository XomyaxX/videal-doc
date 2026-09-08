import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { userCan } from "@/lib/types";
import { prisma } from "@/lib/prisma";
import { saveUpload } from "@/lib/files";
import { parseFnsQr, receiptFingerprint } from "@/lib/qr";
import { rubToKopecks } from "@/lib/money";
import { archiveReceipt } from "@/lib/archive";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !userCan(session.user, "finance.create")) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const { id } = await params;
  const report = await prisma.advanceReport.findFirst({
    where: { id, deletedAt: null },
    include: { receipts: true },
  });
  if (!report) return NextResponse.json({ error: "Отчёт не найден" }, { status: 404 });
  if (report.userId !== session.user.id && !userCan(session.user, "finance.view_all")) {
    return NextResponse.json({ error: "Чужой отчёт" }, { status: 403 });
  }
  if (!["draft", "rework"].includes(report.status)) {
    return NextResponse.json({ error: "Отчёт уже на согласовании — чеки не добавить" }, { status: 400 });
  }

  const settings = await prisma.appSettings.findUnique({ where: { id: "default" } });
  const form = await req.formData();
  const uploads = [...form.getAll("file"), ...form.getAll("files")].filter(
    (f): f is File => f instanceof File && f.size > 0,
  );
  if (uploads.length === 0) {
    return NextResponse.json({ error: "Прикрепите фото или документ расхода" }, { status: 400 });
  }
  const maxBytes = (settings?.maxUploadMb || 32) * 1024 * 1024;
  const saved: { id: string }[] = [];
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
  const cover = saved[0];

  const qrRaw = String(form.get("qrRaw") || "");
  const parsed = qrRaw ? parseFnsQr(qrRaw) : null;
  const fn = String(form.get("fn") || parsed?.fn || "");
  const fd = String(form.get("fd") || parsed?.fd || "");
  const fp = String(form.get("fp") || parsed?.fp || "");
  const amount = form.get("amount") ? rubToKopecks(String(form.get("amount"))) : parsed?.amount || 0;
  if (amount <= 0) return NextResponse.json({ error: "Укажите сумму расхода" }, { status: 400 });
  const fpKey = receiptFingerprint({ fn, fd, fp });
  if (fpKey) {
    const dup = report.receipts.find((r) => receiptFingerprint(r) === fpKey);
    if (dup) {
      return NextResponse.json({ error: "Этот чек уже есть в отчёте (тот же ФН/ФД/ФП)" }, { status: 400 });
    }
  }

  const occurredRaw = String(form.get("occurredAt") || "");
  const row = await prisma.receipt.create({
    data: {
      reportId: id,
      sourceFileId: cover.id,
      files: {
        create: saved.map((f, i) => ({ fileId: f.id, sortOrder: i })),
      },
      qrRaw,
      occurredAt: occurredRaw ? new Date(occurredRaw) : parsed?.occurredAt,
      amount,
      fn,
      fd,
      fp,
      nFlag: parsed?.nFlag || "",
      merchant: String(form.get("merchant") || parsed?.merchant || ""),
      merchantInn: parsed?.merchantInn || "",
      note: String(form.get("note") || ""),
    },
  });
  await archiveReceipt({ ...row, files: saved.map((f) => ({ fileId: f.id })) }, report.userId);
  return NextResponse.json({ id: row.id, files: saved.length });
}
