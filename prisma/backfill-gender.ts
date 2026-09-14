import { PrismaClient } from "@prisma/client";
import { inferGender } from "../src/lib/gender";

const prisma = new PrismaClient();

async function main() {
  const people = await prisma.user.findMany({
    select: { id: true, login: true, firstName: true, middleName: true, gender: true },
  });
  let n = 0;
  for (const p of people) {
    const next = inferGender(p);
    if (!next || p.gender === next) continue;
    await prisma.user.update({ where: { id: p.id }, data: { gender: next } });
    n += 1;
    console.log(p.login, next);
  }
  console.log("gender backfill", n);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
