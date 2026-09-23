import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const row = await prisma.department.findFirst({ where: { name: "ИИ", deletedAt: null } });
  if (!row) {
    const already = await prisma.department.findFirst({ where: { name: "Программирование", deletedAt: null } });
    console.log(already ? "ALREADY Программирование" : "NO ИИ DEPT");
    return;
  }
  await prisma.department.update({ where: { id: row.id }, data: { name: "Программирование" } });
  console.log("RENAMED", row.id);
  const { syncOfficialChats } = await import("../src/lib/chat-official");
  await syncOfficialChats(true);
  console.log("CHATS SYNCED");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
