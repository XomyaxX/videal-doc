import { PrismaClient } from "@prisma/client";
import { ORG_REQUISITES } from "../src/lib/org";
import { ROLE_PRESETS } from "../src/lib/permissions";

const prisma = new PrismaClient();

async function main() {
  for (const [code, preset] of Object.entries(ROLE_PRESETS)) {
    const existingRole = await prisma.role.findUnique({ where: { code } });
    let have: string[] = [];
    try {
      const parsed = existingRole ? JSON.parse(existingRole.permissions || "[]") : [];
      have = Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      have = [];
    }
    const permissions = JSON.stringify(Array.from(new Set([...have, ...preset])));
    if (existingRole) {
      await prisma.role.update({ where: { id: existingRole.id }, data: { permissions } });
    }
  }

  const existing = await prisma.organization.findFirst();
  if (existing) {
    await prisma.organization.update({
      where: { id: existing.id },
      data: ORG_REQUISITES,
    });
    console.log("org updated", existing.id, ORG_REQUISITES.shortName);
    return;
  }
  await prisma.organization.create({ data: ORG_REQUISITES });
  console.log("org created", ORG_REQUISITES.shortName);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
