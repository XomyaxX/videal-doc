import { prisma } from "../src/lib/prisma";
import { storeSecret } from "../src/lib/secret";

function needs(s: string) {
  return Boolean(s) && !s.startsWith("enc:v1:");
}

async function main() {
  let n = 0;
  const s = await prisma.appSettings.findUnique({ where: { id: "default" } });
  if (s) {
    const data: { smtpPassword?: string; imapPassword?: string; fnsPassword?: string } = {};
    if (needs(s.smtpPassword)) data.smtpPassword = storeSecret(s.smtpPassword);
    if (needs(s.imapPassword)) data.imapPassword = storeSecret(s.imapPassword);
    if (needs(s.fnsPassword)) data.fnsPassword = storeSecret(s.fnsPassword);
    if (Object.keys(data).length) {
      await prisma.appSettings.update({ where: { id: "default" }, data });
      n += 1;
    }
  }
  const users = await prisma.user.findMany({
    where: { smtpPassword: { not: "" } },
    select: { id: true, smtpPassword: true },
  });
  for (const u of users) {
    if (!needs(u.smtpPassword)) continue;
    await prisma.user.update({ where: { id: u.id }, data: { smtpPassword: storeSecret(u.smtpPassword) } });
    n += 1;
  }
  console.log("encrypted secrets", n);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
