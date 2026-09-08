import { prisma } from "./prisma";

export async function nextNumber(key: string, prefix: string): Promise<string> {
  const year = new Date().getFullYear();
  const seqKey = `${key}:${year}`;
  const row = await prisma.sequence.upsert({
    where: { key: seqKey },
    create: { key: seqKey, value: 1 },
    update: { value: { increment: 1 } },
  });
  return `${prefix}-${year}-${row.value.toString().padStart(4, "0")}`;
}
