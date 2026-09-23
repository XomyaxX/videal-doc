import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const JUNK = new Set(["", "сдал с карточки", "перенос с доски"]);

async function main() {
  const rows = await prisma.task.findMany({
    where: { brief: "", comment: { not: "" } },
    select: { id: true, comment: true },
  });
  let n = 0;
  for (const row of rows) {
    const text = row.comment.trim();
    if (JUNK.has(text.toLowerCase())) continue;
    await prisma.task.update({ where: { id: row.id }, data: { brief: text.slice(0, 8000) } });
    n += 1;
  }
  console.log("brief backfill", n);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
