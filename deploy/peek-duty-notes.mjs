import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const notes = await prisma.notification.findMany({
  where: { OR: [{ title: "Вынос мусора" }, { title: "Уборка" }] },
  include: { user: { select: { lastName: true, firstName: true } } },
  orderBy: { createdAt: "desc" },
  take: 10,
});
for (const n of notes) {
  console.log([n.createdAt.toISOString(), n.title, n.user.lastName, n.user.firstName, n.body, n.link].join(" | "));
}
console.log("count", notes.length);
await prisma.$disconnect();
