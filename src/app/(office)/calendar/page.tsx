import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { officeYmd, utcMonthDay } from "@/lib/dates";
import { fullName } from "@/lib/names";
import { CalendarBoard } from "./CalendarBoard";
import { canLeadProd } from "@/lib/prod";

export default async function CalendarPage() {
  const user = await requireUser();
  const people = await prisma.user.findMany({
    where: { deletedAt: null, status: "active" },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, lastName: true, firstName: true, middleName: true, birthDate: true },
  });
  const departments = await prisma.department.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
  });

  const year = Number(officeYmd().slice(0, 4));
  const overlays: { ymd: string; label: string; href: string; tone: "gold" | "ok" | "wait" | "navy" }[] = [];
  for (const p of people) {
    if (!p.birthDate) continue;
    const md = utcMonthDay(p.birthDate);
    overlays.push({
      ymd: `${year}-${md}`,
      label: `ДР · ${fullName(p)}`,
      href: `/employees/${p.id}`,
      tone: "gold",
    });
  }

  const funds = await prisma.fundRequest.findMany({
    where: { deletedAt: null, neededAt: { not: null }, status: { notIn: ["rejected", "paid"] } },
    select: { id: true, number: true, purpose: true, neededAt: true, authorId: true, managerId: true },
  });
  const seeAllFunds = ["accountant", "admin", "superadmin"].includes(user.roleCode);
  for (const f of funds) {
    if (!seeAllFunds && f.authorId !== user.id && f.managerId !== user.id) continue;
    overlays.push({
      ymd: officeYmd(f.neededAt!),
      label: `ЗС · ${f.number}`,
      href: `/funds/${f.id}`,
      tone: "wait",
    });
  }

  const dues = await prisma.document.findMany({
    where: {
      deletedAt: null,
      status: "active",
      dueAt: { not: null },
      OR: [{ authorId: user.id }, { recipients: { some: { userId: user.id } } }],
    },
    select: { id: true, title: true, dueAt: true },
    take: 80,
  });
  for (const d of dues) {
    overlays.push({
      ymd: officeYmd(d.dueAt!),
      label: d.title,
      href: `/documents/${d.id}`,
      tone: "navy",
    });
  }

  return (
    <div>
      <PageHeader
        title="Календарь"
        subtitle="Встречи — чипами, задачи — полосой по дням. Свои шоты; чужие видит руководитель."
      />
      <CalendarBoard
        people={people.map(({ id, lastName, firstName, middleName }) => ({ id, lastName, firstName, middleName }))}
        departments={departments}
        meId={user.id}
        overlays={overlays}
        canLead={canLeadProd(user)}
      />
    </div>
  );
}
