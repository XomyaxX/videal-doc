import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

const prisma = new PrismaClient();
const TEMP = "Videal2026!";

async function main() {
  const directorTitle = "Генеральный директор";
  const directorName = "Ермилов Михаил Владимирович";

  const org = await prisma.organization.findFirst();
  if (org) {
    await prisma.organization.update({
      where: { id: org.id },
      data: { directorTitle, directorName },
    });
  } else {
    await prisma.organization.create({ data: { directorTitle, directorName } });
  }

  let position = await prisma.position.findFirst({
    where: { name: directorTitle, deletedAt: null },
  });
  if (!position) position = await prisma.position.create({ data: { name: directorTitle } });

  const dept =
    (await prisma.department.findFirst({ where: { name: "Администрация", deletedAt: null } })) ||
    (await prisma.department.create({ data: { name: "Администрация" } }));

  const role = await prisma.role.findUnique({ where: { code: "manager" } });
  if (!role) throw new Error("Нет роли manager");

  const login = "ermilov.mv";
  const existing = await prisma.user.findUnique({ where: { login } });
  const data = {
    lastName: "Ермилов",
    firstName: "Михаил",
    middleName: "Владимирович",
    roleId: role.id,
    departmentId: dept.id,
    positionId: position.id,
    prodScope: "studio",
    deletedAt: null,
    status: "active" as const,
  };
  if (existing) {
    await prisma.user.update({ where: { id: existing.id }, data });
    console.log("updated", login);
  } else {
    await prisma.user.create({
      data: {
        login,
        passwordHash: hashPassword(TEMP),
        mustChangePassword: true,
        ...data,
      },
    });
    console.log("created", login, "temp", TEMP);
  }

  const { syncOfficialChats } = await import("../src/lib/chat-official");
  await syncOfficialChats(true);
  console.log("org director:", directorName);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
