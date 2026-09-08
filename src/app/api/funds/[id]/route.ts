import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { userCan } from "@/lib/types";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notify";
import { audit } from "@/lib/audit";
import { rubToKopecks } from "@/lib/money";
import { officeYmd } from "@/lib/dates";
import { isFundApprover } from "@/lib/leaders";
import { FUND_FROM_PURCHASE } from "@/lib/requests";
import { archiveFund } from "@/lib/archive";
import { mailSettings, sendMailToUser, siteUrl } from "@/lib/mail";

async function syncPurchase(purchaseRequestId: string | null | undefined, fundStatus: string) {
  const next = FUND_FROM_PURCHASE[fundStatus];
  if (!purchaseRequestId || !next) return;
  await prisma.purchaseRequest.update({
    where: { id: purchaseRequestId },
    data: { status: next },
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await params;
  const row = await prisma.fundRequest.findFirst({ where: { id, deletedAt: null } });
  const isAhoLinked = Boolean(row?.purchaseRequestId) && userCan(session.user, "requests.aho");
  if (!row) return NextResponse.json({ error: "Не найден" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "");
  const note = String(body.note || "");

  if (action === "submit") {
    if (row.authorId !== session.user.id && !isAhoLinked) {
      return NextResponse.json({ error: "Только автор или АХО" }, { status: 403 });
    }
    const managerId = String(body.managerId || row.managerId || "");
    if (!managerId) return NextResponse.json({ error: "Укажите руководителя" }, { status: 400 });
    const mgr = await prisma.user.findFirst({
      where: { id: managerId, deletedAt: null, status: "active" },
      include: { position: true, role: true },
    });
    if (!mgr || !isFundApprover(mgr)) {
      return NextResponse.json(
        { error: "Выберите сотрудника с должностью или ролью «Руководитель»" },
        { status: 400 },
      );
    }
    await prisma.fundRequest.update({
      where: { id },
      data: { status: "review", managerId },
    });
    await syncPurchase(row.purchaseRequestId, "review");
    await notify({
      userId: managerId,
      title: "Запрос средств на согласовании",
      body: row.number,
      link: `/funds/${id}`,
      urgency: "normal",
    });
    await archiveFund(id);
    void (async () => {
      const s = await mailSettings();
      if (s?.mailAutoSend === false) return;
      await sendMailToUser({
        userId: managerId,
        fromUserId: session.user.id,
        subject: `Запрос средств ${row.number}`,
        text: `${row.number} на согласовании.\n${siteUrl(`/funds/${id}`)}`,
      });
    })().catch((e) => console.error("mail.fund", e));
    return NextResponse.json({ ok: true });
  }

  if (action === "approve" || action === "rework" || action === "reject") {
    const isMgr = row.managerId === session.user.id || userCan(session.user, "finance.approve");
    if (!isMgr) return NextResponse.json({ error: "Нет права согласовывать" }, { status: 403 });
    if (action === "approve") {
      await prisma.fundRequest.update({
        where: { id },
        data: { status: "to_pay", managerNote: note, managerAt: new Date() },
      });
      await syncPurchase(row.purchaseRequestId, "to_pay");
      await notify({
        userId: row.authorId,
        title: "Запрос средств согласован",
        body: `${row.number} передан в бухгалтерию к выплате`,
        link: `/funds/${id}`,
        urgency: "normal",
      });
      const acc = await prisma.user.findMany({
        where: { deletedAt: null, status: "active", role: { code: { in: ["accountant", "admin", "superadmin"] } } },
      });
      for (const a of acc) {
        await notify({
          userId: a.id,
          title: "К выплате: запрос средств",
          body: row.number,
          link: `/funds/${id}`,
          urgency: "urgent",
        });
      }
    } else {
      await prisma.fundRequest.update({
        where: { id },
        data: {
          status: action === "reject" ? "rejected" : "rework",
          managerNote: note,
          managerAt: new Date(),
        },
      });
      await syncPurchase(row.purchaseRequestId, action === "reject" ? "rejected" : "rework");
      await notify({
        userId: row.authorId,
        title: action === "reject" ? "Запрос средств отклонён" : "Запрос средств на доработке",
        body: note || row.number,
        link: `/funds/${id}`,
        urgency: "urgent",
      });
    }
    await audit({ userId: session.user.id, action: `fund.${action}`, entity: "fund", entityId: id });
    return NextResponse.json({ ok: true });
  }

  if (action === "paid" || action === "acc-reject") {
    if (!["accountant", "admin", "superadmin"].includes(session.user.roleCode)) {
      return NextResponse.json({ error: "Нет права бухгалтерии" }, { status: 403 });
    }
    await prisma.fundRequest.update({
      where: { id },
      data: {
        status: action === "paid" ? "paid" : "rejected",
        accountantId: session.user.id,
        accountantNote: note,
        paidAt: action === "paid" ? new Date() : null,
      },
    });
    await syncPurchase(row.purchaseRequestId, action === "paid" ? "paid" : "rejected");
    if (action === "paid" && row.purchaseRequestId) {
      const ahos = await prisma.user.findMany({
        where: { deletedAt: null, status: "active", role: { code: "aho" } },
      });
      for (const a of ahos) {
        await notify({
          userId: a.id,
          title: "Можно закупать",
          body: row.number,
          link: `/requests/${row.purchaseRequestId}`,
          urgency: "normal",
        });
      }
    }
    await notify({
      userId: row.authorId,
      title: action === "paid" ? "Средства выплачены" : "Бухгалтерия отклонила запрос",
      body: note || row.number,
      link: `/funds/${id}`,
      urgency: action === "paid" ? "normal" : "urgent",
    });
    if (action === "paid") await archiveFund(id);
    return NextResponse.json({ ok: true });
  }

  if (action === "save" && ["draft", "rework"].includes(row.status) && (row.authorId === session.user.id || isAhoLinked)) {
    if (body.neededAt && String(body.neededAt).slice(0, 10) < officeYmd()) {
      return NextResponse.json({ error: "Дата не может быть в прошлом" }, { status: 400 });
    }
    await prisma.fundRequest.update({
      where: { id },
      data: {
        purpose: String(body.purpose || row.purpose),
        details: String(body.details ?? row.details),
        amount: body.amount !== undefined ? rubToKopecks(body.amount) : row.amount,
        payee: String(body.payee ?? row.payee),
        neededAt: body.neededAt ? new Date(body.neededAt) : row.neededAt,
        managerId: body.managerId || row.managerId,
      },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
}
