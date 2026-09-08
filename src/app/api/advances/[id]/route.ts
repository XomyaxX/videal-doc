import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { userCan } from "@/lib/types";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { rubToKopecks } from "@/lib/money";
import { archiveAdvance } from "@/lib/archive";
import { mailAdvanceToAccountant } from "@/lib/advance-mail";

async function load(id: string) {
  return prisma.advanceReport.findFirst({
    where: { id, deletedAt: null },
    include: { receipts: true, user: true },
  });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await params;
  const report = await load(id);
  if (!report) return NextResponse.json({ error: "Не найден" }, { status: 404 });
  if (report.userId !== session.user.id && !userCan(session.user, "finance.view_all")) {
    return NextResponse.json({ error: "Чужой отчёт" }, { status: 403 });
  }
  if (!["draft", "rework"].includes(report.status)) {
    return NextResponse.json({ error: "Нельзя менять на согласовании" }, { status: 400 });
  }
  const body = await req.json();
  await prisma.advanceReport.update({
    where: { id },
    data: {
      purpose: String(body.purpose || ""),
      issuedAmount: body.issuedAmount !== undefined ? rubToKopecks(body.issuedAmount) : report.issuedAmount,
    },
  });
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await params;
  const report = await load(id);
  if (!report) return NextResponse.json({ error: "Не найден" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "");
  const spent = report.receipts.reduce((s, r) => s + r.amount, 0);

  if (action === "submit" || action === "submit-mail") {
    if (report.userId !== session.user.id) return NextResponse.json({ error: "Только автор" }, { status: 403 });
    if (report.receipts.length === 0) {
      return NextResponse.json({ error: "Добавьте хотя бы один расход с фото или документом" }, { status: 400 });
    }
    if (spent <= 0) return NextResponse.json({ error: "Сумма расходов не может быть нулевой" }, { status: 400 });
    await prisma.advanceReport.update({ where: { id }, data: { status: "review" } });
    await archiveAdvance(id);
    const accountants = await prisma.user.findMany({
      where: { deletedAt: null, status: "active", role: { code: { in: ["accountant", "admin", "superadmin"] } } },
    });
    for (const a of accountants) {
      await notify({
        userId: a.id,
        title: "Авансовый на проверке",
        body: report.number,
        link: `/advances/${id}`,
        urgency: "normal",
      });
    }
    await audit({ userId: session.user.id, action: "advance.submit", entity: "advance", entityId: id });
    if (action === "submit-mail") {
      const mailed = await mailAdvanceToAccountant({ reportId: id, fromUserId: session.user.id });
      if (!mailed.ok) {
        return NextResponse.json({
          ok: true,
          mailed: false,
          mailError: mailed.error || "Не удалось отправить письмо",
        });
      }
      return NextResponse.json({ ok: true, mailed: true, to: mailed.to });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "review" || action === "rework" || action === "approve" || action === "accept") {
    if (!userCan(session.user, "finance.approve")) return NextResponse.json({ error: "Нет права согласовывать" }, { status: 403 });
  }

  if (action === "rework") {
    await prisma.advanceReport.update({
      where: { id },
      data: { status: "rework", accountantNote: String(body.note || ""), accountantId: session.user.id },
    });
    await notify({
      userId: report.userId,
      title: "Авансовый вернули на доработку",
      body: String(body.note || report.number),
      link: `/advances/${id}`,
      urgency: "urgent",
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "review-ok") {
    await prisma.advanceReport.update({
      where: { id },
      data: {
        status: "approve",
        accountantId: session.user.id,
        accountantNote: String(body.note || ""),
        reviewedAt: new Date(),
      },
    });
    await notify({
      userId: report.userId,
      title: "Бухгалтер принял авансовый",
      body: report.number,
      link: `/advances/${id}`,
      urgency: "normal",
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "accept") {
    await prisma.advanceReport.update({
      where: { id },
      data: {
        status: "accepted",
        directorId: session.user.id,
        directorNote: String(body.note || ""),
        approvedAt: new Date(),
      },
    });
    await notify({
      userId: report.userId,
      title: "Авансовый утверждён",
      body: report.number,
      link: `/advances/${id}`,
      urgency: "normal",
    });
    await audit({ userId: session.user.id, action: "advance.accept", entity: "advance", entityId: id });
    await archiveAdvance(id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await params;
  const report = await load(id);
  if (!report) return NextResponse.json({ error: "Не найден" }, { status: 404 });
  if (report.userId !== session.user.id && !userCan(session.user, "finance.view_all")) {
    return NextResponse.json({ error: "Нельзя" }, { status: 403 });
  }
  if (!["draft", "rework"].includes(report.status)) {
    return NextResponse.json({ error: "Можно удалить только черновик" }, { status: 400 });
  }
  await prisma.advanceReport.update({ where: { id }, data: { deletedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
