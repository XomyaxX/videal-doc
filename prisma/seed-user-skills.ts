import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const BY_LOGIN: Record<string, string[]> = {
  laptev: ["director", "anim3d"],
  ermilov: ["director"],
  lyudmila: ["director"],
  demidovich: ["director"],
  khozyainov: ["anim3d"],
  chetverikova: ["anim3d"],
  kozlov: ["anim3d"],
  rebro: ["anim2d", "anim3d"],
  propastina: ["anim2d", "anim3d"],
  radle: ["modeler", "sculptor"],
  mitrofanov: ["modeler", "sculptor"],
  boyarenok: ["modeler", "sculptor"],
  novikova: ["texture"],
  rulko: ["texture"],
  zimareva: ["concept"],
  tochanskaya: ["concept"],
};

function fromDeptPos(dept: string, pos: string): string[] {
  const d = dept.toLocaleLowerCase("ru");
  const p = pos.toLocaleLowerCase("ru");
  const out: string[] = [];
  if (p.includes("режисс") || p.includes("директор")) out.push("director");
  if (p.includes("сценарист")) out.push("writer");
  if (p.includes("концепт")) out.push("concept");
  if (p.includes("скульпт")) out.push("sculptor");
  if (p.includes("модель")) out.push("modeler");
  if (p.includes("текстур")) out.push("texture");
  if (p.includes("локац")) out.push("location");
  if (p.includes("композ")) out.push("comp");
  if (p.includes("рендер")) out.push("render");
  if (p.includes("монтаж")) out.push("edit");
  if (p.includes("2d") || p.includes("2д")) out.push("anim2d");
  if (d.includes("анимац")) out.push("anim3d");
  if (d.includes("производ")) {
    out.push("modeler", "texture");
  }
  return out;
}

async function main() {
  const skills = await prisma.skill.findMany();
  const byCode = Object.fromEntries(skills.map((s) => [s.code, s.id]));
  const users = await prisma.user.findMany({
    where: { deletedAt: null, status: "active" },
    include: { department: true, position: true, skills: true },
  });
  let n = 0;
  for (const u of users) {
    const codes = new Set([
      ...(BY_LOGIN[u.login] || []),
      ...fromDeptPos(u.department?.name || "", u.position?.name || ""),
    ]);
    const have = new Set(u.skills.map((s) => s.skillId));
    for (const code of codes) {
      const skillId = byCode[code];
      if (!skillId || have.has(skillId)) continue;
      await prisma.userSkill.create({ data: { userId: u.id, skillId } });
      n += 1;
    }
  }
  console.log("user skills added", n);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
