import { dutyForWeek, upcomingWorkdays } from "../src/lib/duty.ts";
import { PrismaClient } from "@prisma/client";

const cur = await dutyForWeek();
console.log("TODAY", cur.today, cur.todayLabel);
console.log("TRASH", cur.trash?.name || "—");
console.log("CLEAN", cur.clean.map((p) => p.name).join(" · ") || "—");
console.log("--- days ---");
for (const d of upcomingWorkdays(cur.men, cur.today, 10)) {
  console.log(d.ymd, d.label, d.person?.name || "—");
}

const prisma = new PrismaClient();
const notes = await prisma.notification.findMany({
  where: { OR: [{ title: "Вынос мусора" }, { title: "Уборка" }] },
  include: { user: { select: { lastName: true, firstName: true } } },
  orderBy: { createdAt: "desc" },
  take: 6,
});
console.log("--- notes ---");
for (const n of notes) {
  console.log(n.createdAt.toISOString(), n.title, n.user.lastName, n.body);
}
await prisma.$disconnect();
