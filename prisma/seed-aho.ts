import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";
import { ROLE_PRESETS } from "../src/lib/permissions";

const prisma = new PrismaClient();

async function main() {
  for (const [code, perms] of Object.entries(ROLE_PRESETS)) {
    const name =
      code === "aho"
        ? "АХО"
        : undefined;
    const existing = await prisma.role.findUnique({ where: { code } });
    let have: string[] = [];
    try {
      const parsed = existing ? JSON.parse(existing.permissions || "[]") : [];
      have = Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      have = [];
    }
    const permissions = JSON.stringify(Array.from(new Set([...have, ...perms])));
    await prisma.role.upsert({
      where: { code },
      create: {
        code,
        name: name || code,
        description: code === "aho" ? "Календарь, рассылка, закупки" : "",
        isSystem: true,
        permissions: JSON.stringify(perms),
      },
      update: {
        permissions,
        ...(name ? { name, description: "Календарь, рассылка, закупки" } : {}),
      },
    });
  }

  const ahoRole = await prisma.role.findUnique({ where: { code: "aho" } });
  if (!ahoRole) throw new Error("no aho role");
  let dept = await prisma.department.findFirst({
    where: { name: "Административно-хозяйственный отдел", deletedAt: null },
  });
  if (!dept) dept = await prisma.department.create({ data: { name: "Административно-хозяйственный отдел" } });
  let pos = await prisma.position.findFirst({ where: { name: "Специалист АХО", deletedAt: null } });
  if (!pos) pos = await prisma.position.create({ data: { name: "Специалист АХО" } });

  const existing = await prisma.user.findUnique({ where: { login: "balov" } });
  if (!existing) {
    await prisma.user.create({
      data: {
        login: "balov",
        passwordHash: hashPassword("Videal2026!"),
        lastName: "Балов",
        firstName: "Павел",
        middleName: "Александрович",
        roleId: ahoRole.id,
        departmentId: dept.id,
        positionId: pos.id,
        mustChangePassword: true,
      },
    });
    console.log("created balov / Videal2026!");
  } else {
    await prisma.user.update({
      where: { id: existing.id },
      data: { roleId: ahoRole.id, departmentId: dept.id, positionId: pos.id },
    });
    console.log("updated balov");
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
