import { PrismaClient } from "@prisma/client";
import { reclassifyAssetKind } from "../src/lib/asset-kind";

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.asset.findMany({ select: { id: true, name: true, kind: true } });
  let n = 0;
  for (const row of rows) {
    const next = reclassifyAssetKind(row.name, row.kind);
    if (next === row.kind) continue;
    await prisma.asset.update({ where: { id: row.id }, data: { kind: next } });
    n += 1;
    console.log(`${row.kind} → ${next}\t${row.name.replace(/\s+/g, " ")}`);
  }
  console.log(`updated ${n} of ${rows.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
