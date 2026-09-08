import { PrismaClient } from "@prisma/client";
import { ROLE_PRESETS } from "../src/lib/permissions";

const prisma = new PrismaClient();

async function main() {
  const preset = ROLE_PRESETS.aho;
  const row = await prisma.role.findUnique({ where: { code: "aho" } });
  if (!row) throw new Error("no aho role");
  let have: string[] = [];
  try {
    const parsed = JSON.parse(row.permissions || "[]");
    have = Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    have = [];
  }
  const permissions = JSON.stringify(Array.from(new Set([...have, ...preset])));
  await prisma.role.update({ where: { id: row.id }, data: { permissions } });
  console.log("aho perms", permissions);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
