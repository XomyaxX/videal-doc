import { PrismaClient } from "@prisma/client";
import { SKILLS } from "../src/lib/pipeline";

const prisma = new PrismaClient();

async function main() {
  for (const s of SKILLS) {
    await prisma.skill.upsert({
      where: { code: s.code },
      create: { code: s.code, name: s.name, body: s.body },
      update: { name: s.name, body: s.body },
    });
  }
  console.log("skills", SKILLS.length);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
