import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const settings = await prisma.appSettings.findUnique({ where: { id: "default" } });
console.log("lastDutyYmd", JSON.stringify(settings?.lastDutyYmd ?? null));
const people = await prisma.user.findMany({
  where: { deletedAt: null, status: "active" },
  include: { role: true, department: true, position: true },
  orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
});
for (const p of people) {
  console.log(
    [p.lastName, p.firstName, p.gender || "-", p.role.code, p.department?.name || "-", p.position?.name || "-"].join(" | "),
  );
}
await prisma.$disconnect();
