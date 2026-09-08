import { writeFileSync } from "fs";
import { prisma } from "../src/lib/prisma";
import { renderAdvancePdf } from "../src/lib/pdf/render";

async function main() {
  const report = await prisma.advanceReport.findFirst({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!report) throw new Error("Нет авансового отчёта");
  const buf = await renderAdvancePdf(report.id);
  writeFileSync("data/ao1-check.pdf", buf);
  console.log("wrote data/ao1-check.pdf", buf.length, report.number);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
