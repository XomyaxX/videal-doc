import { PrismaClient } from "@prisma/client";

async function main() {
  const p = new PrismaClient();
  const roles = await p.role.findMany({ select: { id: true, code: true, name: true } });
  console.log(JSON.stringify(roles, null, 2));
  await p.$disconnect();
}

main();
