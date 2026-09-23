import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PEOPLE: { login: string; extra: string[] }[] = [
  { login: "laptev", extra: ["Производство", "Сценарий"] },
  { login: "propastina", extra: ["Производство", "Сценарий"] },
  { login: "demidovich", extra: ["Анимация", "Сценарий"] },
];

async function main() {
  const depts = await prisma.department.findMany({ where: { deletedAt: null } });
  const byName = Object.fromEntries(depts.map((d) => [d.name, d.id]));
  for (const p of PEOPLE) {
    const user = await prisma.user.findUnique({
      where: { login: p.login },
      include: { department: true },
    });
    if (!user || user.deletedAt) {
      console.log("SKIP", p.login);
      continue;
    }
    const ids = p.extra.map((n) => byName[n]).filter((id) => id && id !== user.departmentId);
    await prisma.userDepartmentAccess.deleteMany({ where: { userId: user.id } });
    if (ids.length) {
      await prisma.userDepartmentAccess.createMany({
        data: ids.map((departmentId) => ({ userId: user.id, departmentId })),
      });
    }
    console.log("OK", p.login, user.department?.name, "extra", p.extra.join(", "));
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
