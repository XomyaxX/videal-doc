import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { userCan } from "@/lib/types";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notify";
import { nextNumber } from "@/lib/sequence";
import { rubToKopecks } from "@/lib/money";
import { officeYmd } from "@/lib/dates";
import { isFundApprover } from "@/lib/leaders";
import { FUND_FROM_PURCHASE } from "@/lib/requests";
import { archiveFund, archivePurchase } from "@/lib/archive";
import { USER_SAFE_SELECT } from "@/lib/user-public";

async function load(id: string) {
  return prisma.purchaseRequest.findUnique({
    where: { id },
    include: {
      author: { select: USER_SAFE_SELECT },
      ahoUser: { select: USER_SAFE_SELECT },
      items: { orderBy: { sortOrder: "asc" } },
      fundRequest: true,
    },
  });
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await ctx.params;
  const row = await load(id);
  if (!row) return NextResponse.json({ error: "Нет запроса" }, { status: 404 });
  const aho = userCan(session.user, "requests.aho");
  if (!aho && row.authorId !== session.user.id) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  return NextResponse.json({ row });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await ctx.params;
  const row = await load(id);
  if (!row) return NextResponse.json({ error: "Нет запроса" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "");
  const aho = userCan(session.user, "requests.aho");
  const mine = row.authorId === session.user.id;

  if (action === "submit" && mine && ["draft", "rework"].includes(row.status)) {
    const details = row.items
      .map((i) => `• ${i.name} × ${i.qty} ${i.unit}${i.url ? `\n  ${i.url}` : ""}`)
      .join("\n");
    if (!row.fundRequest) {
      const zs = await nextNumber("zs", "ЗС");
      await prisma.fundRequest.create({
        data: {
          number: zs,
          authorId: row.authorId,
          amount: 0,
          purpose: `Закупка: ${row.title}`,
          details: `${row.reason ? row.reason + "\n\n" : ""}Позиции:\n${details}`,
          status: "draft",
          purchaseRequestId: row.id,
        },
      });
    }
    await prisma.purchaseRequest.update({ where: { id }, data: { status: "submitted" } });
    const ahos = await prisma.user.findMany({
      where: { deletedAt: null, status: "active", role: { code: "aho" } },
    });
    for (const u of ahos) {
      await notify({
        userId: u.id,
        title: "Новый запрос на закупку",
        body: `${row.number} · ${row.title}`,
        link: `/requests/${id}`,
        urgency: "normal",
      });
    }
    await archivePurchase(id);
    return NextResponse.json({ ok: true });
  }

  if (action === "withdraw" && mine && row.status === "submitted") {
    await prisma.purchaseRequest.update({ where: { id }, data: { status: "draft" } });
    return NextResponse.json({ ok: true });
  }

  if (!aho) return NextResponse.json({ error: "Нет права АХО" }, { status: 403 });

  if (action === "take") {
    await prisma.purchaseRequest.update({
      where: { id },
      data: { ahoUserId: session.user.id, status: row.status === "submitted" ? "pricing" : row.status },
    });
    await archivePurchase(id);
    return NextResponse.json({ ok: true });
  }

  if (action === "rework") {
    await prisma.purchaseRequest.update({
      where: { id },
      data: { status: "rework" },
    });
    await notify({
      userId: row.authorId,
      title: "Запрос вернули на доработку",
      body: String(body.note || row.number),
      link: `/requests/${id}`,
      urgency: "urgent",
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "save-fund") {
    const fund = row.fundRequest;
    if (!fund || !["draft", "rework"].includes(fund.status)) {
      return NextResponse.json({ error: "Служебную записку уже нельзя править" }, { status: 400 });
    }
    const amount = body.amount !== undefined ? rubToKopecks(body.amount) : fund.amount;
    const neededRaw = String(body.neededAt || "");
    if (neededRaw && neededRaw.slice(0, 10) < officeYmd()) {
      return NextResponse.json({ error: "Дата не может быть в прошлом" }, { status: 400 });
    }
    await prisma.fundRequest.update({
      where: { id: fund.id },
      data: {
        amount,
        details: body.details !== undefined ? String(body.details) : fund.details,
        payee: body.payee !== undefined ? String(body.payee) : fund.payee,
        neededAt: neededRaw ? new Date(neededRaw) : fund.neededAt,
        managerId: body.managerId || fund.managerId,
      },
    });
    await prisma.purchaseRequest.update({
      where: { id },
      data: { status: "pricing", ahoUserId: String(body.ahoUserId || session.user.id) },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "send-fund") {
    const fund = row.fundRequest;
    if (!fund) return NextResponse.json({ error: "Нет служебной записки" }, { status: 400 });
    const amount = body.amount !== undefined ? rubToKopecks(body.amount) : fund.amount;
    const neededRaw = String(body.neededAt || "");
    if (neededRaw && neededRaw.slice(0, 10) < officeYmd()) {
      return NextResponse.json({ error: "Дата не может быть в прошлом" }, { status: 400 });
    }
    await prisma.fundRequest.update({
      where: { id: fund.id },
      data: {
        amount,
        details: body.details !== undefined ? String(body.details) : fund.details,
        payee: body.payee !== undefined ? String(body.payee) : fund.payee,
        neededAt: neededRaw ? new Date(neededRaw) : fund.neededAt,
        managerId: body.managerId || fund.managerId,
      },
    });
    if (body.ahoUserId) {
      await prisma.purchaseRequest.update({
        where: { id },
        data: { ahoUserId: String(body.ahoUserId) },
      });
    }
    if (amount <= 0) return NextResponse.json({ error: "Сначала укажите сумму" }, { status: 400 });
    const managerId = String(body.managerId || fund.managerId || "");
    if (!managerId) return NextResponse.json({ error: "Выберите руководителя" }, { status: 400 });
    const mgr = await prisma.user.findFirst({
      where: { id: managerId, deletedAt: null, status: "active" },
      include: { position: true, role: true },
    });
    if (!mgr || !isFundApprover(mgr)) {
      return NextResponse.json({ error: "Нужен сотрудник с ролью или должностью руководителя" }, { status: 400 });
    }
    await prisma.fundRequest.update({
      where: { id: fund.id },
      data: { status: "review", managerId },
    });
    await prisma.purchaseRequest.update({ where: { id }, data: { status: "review", ahoUserId: session.user.id } });
    await notify({
      userId: managerId,
      title: "Закупка на согласовании",
      body: `${row.number} · ${fund.number}`,
      link: `/funds/${fund.id}`,
      urgency: "normal",
    });
    await archiveFund(fund.id);
    await archivePurchase(id);
    return NextResponse.json({ ok: true });
  }

  if (action === "fulfill") {
    const fund = row.fundRequest;
    if (!fund || fund.status !== "paid") {
      return NextResponse.json({ error: "Сначала должны выплатить средства" }, { status: 400 });
    }
    await prisma.purchaseRequest.update({
      where: { id },
      data: { status: "done", doneAt: new Date(), ahoUserId: session.user.id },
    });
    await notify({
      userId: row.authorId,
      title: "Закупка выполнена",
      body: row.title,
      link: `/requests/${id}`,
      urgency: "normal",
    });
    await archivePurchase(id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
}

export function syncPurchaseFromFund(fundStatus: string) {
  return FUND_FROM_PURCHASE[fundStatus] || null;
}
