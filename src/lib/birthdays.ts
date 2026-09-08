import { prisma } from "./prisma";
import { notify, notifyMany } from "./notify";
import { ageYears, officeYmd, utcMonthDay } from "./dates";
import { fullName } from "./names";

export async function tickBirthdays() {
  const today = officeYmd();
  const settings = await prisma.appSettings.findUnique({ where: { id: "default" } });
  if (settings?.lastBirthdayYmd === today) return;

  const people = await prisma.user.findMany({
    where: { deletedAt: null, status: "active", birthDate: { not: null } },
    include: { department: true },
  });
  const todayMd = today.slice(5);
  const honorees = people.filter((p) => p.birthDate && utcMonthDay(p.birthDate) === todayMd);

  for (const person of honorees) {
    const age = ageYears(person.birthDate!, today);
    const who = fullName(person);
    await notify({
      userId: person.id,
      title: "С днём рождения!",
      body: `Видеал.Док и коллеги поздравляют вас, ${person.firstName}! Сегодня вам ${age}. Хорошего дня.`,
      link: "/profile",
      urgency: "info",
    });

    const colleagues = await prisma.user.findMany({
      where: {
        deletedAt: null,
        status: "active",
        id: { not: person.id },
        ...(person.departmentId ? { departmentId: person.departmentId } : {}),
      },
      select: { id: true },
    });
    const dept = person.department?.name ? ` (${person.department.name})` : "";
    await notifyMany(
      colleagues.map((c) => c.id),
      {
        title: "Сегодня день рождения",
        body: `${who}${dept} — поздравьте коллегу, сегодня ${age}.`,
        link: `/employees/${person.id}`,
        urgency: "info",
      },
    );
  }

  await prisma.appSettings.update({
    where: { id: "default" },
    data: { lastBirthdayYmd: today },
  });
}

export function upcomingBirthdays<
  T extends {
    id: string;
    birthDate: Date | null;
    lastName: string;
    firstName: string;
    department?: { name: string } | null;
  },
>(people: T[], days = 14) {
  const today = officeYmd();
  const [y, m, d] = today.split("-").map(Number);
  const start = Date.UTC(y, m - 1, d);
  const out: { person: T; when: Date; inDays: number; age: number }[] = [];
  for (const p of people) {
    if (!p.birthDate) continue;
    const bm = p.birthDate.getUTCMonth();
    const bd = p.birthDate.getUTCDate();
    let when = Date.UTC(y, bm, bd);
    if (when < start) when = Date.UTC(y + 1, bm, bd);
    const inDays = Math.round((when - start) / 86400000);
    if (inDays > days) continue;
    const onYmd = new Date(when).toISOString().slice(0, 10);
    out.push({ person: p, when: new Date(when), inDays, age: ageYears(p.birthDate, onYmd) });
  }
  return out.sort((a, b) => a.inDays - b.inDays || a.person.lastName.localeCompare(b.person.lastName, "ru"));
}
