import { PrismaClient } from "@prisma/client";
import { ROLE_PRESETS } from "../src/lib/permissions";

const prisma = new PrismaClient();

const ROLE_META: Record<string, { name: string; description: string }> = {
  remote: {
    name: "Дистанционный",
    description: "Работа вне офиса: свои задачи и документы. Без SCAN, журнала прихода, инвентаря и чужих бумаг.",
  },
};

function parseList(raw: string | null | undefined) {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

async function main() {
  const remotePreset = ROLE_PRESETS.remote ?? [];
  const remote = await prisma.role.findUnique({ where: { code: "remote" } });
  if (!remote) {
    const created = await prisma.role.create({
      data: {
        code: "remote",
        name: ROLE_META.remote.name,
        description: ROLE_META.remote.description,
        isSystem: true,
        permissions: JSON.stringify(remotePreset),
      },
    });
    console.log("created role", created.code, created.id);
  }

  const extras = ["data.view", "data.work"] as const;
  for (const [code, preset] of Object.entries(ROLE_PRESETS)) {
    const row = await prisma.role.findUnique({ where: { code } });
    if (!row) continue;
    const have = parseList(row.permissions);
    const add = extras.filter((p) => preset.includes(p) && !have.includes(p));
    if (!add.length) continue;
    const permissions = JSON.stringify([...have, ...add]);
    await prisma.role.update({ where: { id: row.id }, data: { permissions } });
    console.log("added", add.join(","), code);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
