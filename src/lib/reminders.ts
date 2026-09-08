import { prisma } from "./prisma";
import { notify } from "./notify";
import { documentUrgency } from "./notify-urgency";
import { tickBirthdays } from "./birthdays";
import { officeYmd } from "./dates";
import { daysUntilYmd, dueLabel, issuedYmd, reportDueYmd } from "./report-period";

export async function tickReminders() {
  tickBirthdays().catch(() => {});
  const settings = await prisma.appSettings.findUnique({ where: { id: "default" } });
  const last = settings?.lastRemindAt;
  const now = new Date();
  if (last && now.getTime() - last.getTime() < 20 * 60 * 60 * 1000) return;

  const pending = await prisma.documentRecipient.findMany({
    where: {
      document: { status: "active", deletedAt: null, remindDaily: true },
      rejectedAt: null,
      OR: [
        { document: { requireAck: true }, ackedAt: null },
        { document: { requireSignedReturn: true }, signedAt: null },
        { document: { requireApproval: true }, isApprover: true, approvedAt: null },
      ],
    },
    include: { document: true, user: true },
  });

  for (const row of pending) {
    if (row.lastRemindedAt && now.getTime() - row.lastRemindedAt.getTime() < 20 * 60 * 60 * 1000) continue;
    await notify({
      userId: row.userId,
      title: "Напоминание: документ ждёт вас",
      body: row.document.title,
      link: `/documents/${row.documentId}`,
      urgency: documentUrgency(row.document) === "urgent" ? "urgent" : "info",
    });
    await prisma.documentRecipient.update({
      where: { id: row.id },
      data: { lastRemindedAt: now },
    });
  }

  const funds = await prisma.fundRequest.findMany({
    where: { deletedAt: null, status: { in: ["review", "to_pay"] } },
  });
  for (const f of funds) {
    if (f.status === "review" && f.managerId) {
      await notify({
        userId: f.managerId,
        title: "Напоминание: запрос средств ждёт согласования",
        body: `${f.number} · ${f.purpose}`,
        link: `/funds/${f.id}`,
        urgency: "normal",
      });
    }
    if (f.status === "to_pay") {
      const acc = await prisma.user.findMany({
        where: { deletedAt: null, status: "active", role: { code: { in: ["accountant", "admin", "superadmin"] } } },
        select: { id: true },
      });
      for (const a of acc) {
        await notify({
          userId: a.id,
          title: "Напоминание: запрос средств к выплате",
          body: `${f.number} · ${f.purpose}`,
          link: `/funds/${f.id}`,
          urgency: "urgent",
        });
      }
    }
  }

  const today = officeYmd();
  const openFunds = await prisma.fundRequest.findMany({
    where: { deletedAt: null, status: "paid", advanceReportId: null },
  });
  const dueNow: typeof openFunds = [];
  for (const f of openFunds) {
    const due = reportDueYmd(issuedYmd(f));
    const days = daysUntilYmd(due, today);
    if (!(days === 3 || days === 1 || days === 0 || days < 0)) continue;
    if (f.lastReportRemindAt && now.getTime() - f.lastReportRemindAt.getTime() < 20 * 60 * 60 * 1000) continue;
    dueNow.push(f);
    const overdue = days < 0;
    await notify({
      userId: f.authorId,
      title: overdue ? "Срок авансового отчёта истёк" : "Пора отчитаться по запросу средств",
      body: `${f.number} · ${f.purpose} · до ${dueLabel(due)}`,
      link: `/advances/new?funds=${f.id}`,
      urgency: overdue || days === 0 ? "urgent" : "normal",
    });
    await prisma.fundRequest.update({
      where: { id: f.id },
      data: { lastReportRemindAt: now },
    });
  }
  if (dueNow.length > 0) {
    const acc = await prisma.user.findMany({
      where: { deletedAt: null, status: "active", role: { code: { in: ["accountant", "admin", "superadmin"] } } },
      select: { id: true },
    });
    for (const a of acc) {
      await notify({
        userId: a.id,
        title: "Запросы средств без авансового отчёта",
        body: `${dueNow.length} шт. — сотрудники должны отчитаться к 5-му числу`,
        link: "/finance",
        urgency: "normal",
      });
    }
  }

  await prisma.appSettings.update({
    where: { id: "default" },
    data: { lastRemindAt: now },
  });
}
