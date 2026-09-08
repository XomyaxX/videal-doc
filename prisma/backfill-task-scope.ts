import { PrismaClient } from "@prisma/client";
import { taskScopeKey } from "../src/lib/current-episode";

const prisma = new PrismaClient();

async function main() {
  const tasks = await prisma.task.findMany({
    select: { id: true, stage: true, shotId: true, assetId: true, sceneId: true, scopeKey: true },
  });
  const used = new Set(tasks.map((t) => t.scopeKey).filter(Boolean));
  let n = 0;
  for (const t of tasks) {
    if (t.scopeKey) continue;
    let key = taskScopeKey(t);
    if (!key) continue;
    if (used.has(key)) key = `${key}:${t.id}`;
    used.add(key);
    await prisma.task.update({ where: { id: t.id }, data: { scopeKey: key } });
    n += 1;
  }
  try {
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS Task_scopeKey_unique ON Task(scopeKey) WHERE scopeKey != ''`,
    );
    console.log("unique index ok");
  } catch (e) {
    console.log("unique index skip", e instanceof Error ? e.message : e);
  }
  console.log("task scopeKey backfill", n);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
