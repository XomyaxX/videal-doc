import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.receipt.findMany({
    include: { files: { select: { fileId: true } } },
  });
  let n = 0;
  for (const row of rows) {
    if (!row.sourceFileId) continue;
    if (row.files.some((f) => f.fileId === row.sourceFileId)) continue;
    await prisma.receiptFile.create({
      data: { receiptId: row.id, fileId: row.sourceFileId, sortOrder: 0 },
    });
    n += 1;
  }
  console.log(`linked ${n} of ${rows.length} receipts`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
