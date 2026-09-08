import { PrismaClient } from "@prisma/client";
import { SKILLS } from "../src/lib/pipeline";
import { shareRoot } from "../src/lib/prod";

const prisma = new PrismaClient();

async function main() {
  for (const s of SKILLS) {
    await prisma.skill.upsert({
      where: { code: s.code },
      create: { code: s.code, name: s.name, body: s.body },
      update: { name: s.name, body: s.body },
    });
  }

  await prisma.show.updateMany({ where: { code: "SG" }, data: { pipelineKind: "e02" } });

  const show = await prisma.show.upsert({
    where: { code: "AI" },
    update: { name: "ИИ-мультфильм", pipelineKind: "ai" },
    create: { code: "AI", name: "ИИ-мультфильм", pipelineKind: "ai" },
  });
  await prisma.episode.upsert({
    where: { showId_code: { showId: show.id, code: "E01" } },
    update: { name: "Пилот", diskPath: `${shareRoot()}/Data/AI/E01` },
    create: {
      showId: show.id,
      code: "E01",
      name: "Пилот",
      diskPath: `${shareRoot()}/Data/AI/E01`,
    },
  });

  const aiCodes = ["writer", "storyboard", "concept", "first_frame", "gen_video", "edit"];
  const skills = await prisma.skill.findMany({ where: { code: { in: aiCodes } } });
  const ii = await prisma.department.findFirst({ where: { name: "ИИ", deletedAt: null } });
  if (ii && skills.length) {
    const people = await prisma.user.findMany({ where: { departmentId: ii.id, deletedAt: null } });
    for (const u of people) {
      for (const sk of skills) {
        await prisma.userSkill.upsert({
          where: { userId_skillId: { userId: u.id, skillId: sk.id } },
          create: { userId: u.id, skillId: sk.id },
          update: {},
        });
      }
    }
  }
  console.log("AI show", show.code, "skills", skills.map((s) => s.code).join(","));
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
