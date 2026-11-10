import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { fullName } from "@/lib/names";
import { prisma } from "@/lib/prisma";
import { canUseWorkBoard, loadSnapshot } from "@/lib/work-board";
import { WorkBoard } from "./WorkBoard";

export const dynamic = "force-dynamic";

export default async function BoardPage() {
  const user = await requireUser();
  if (!canUseWorkBoard(user)) notFound();
  const [snapshot, people] = await Promise.all([
    loadSnapshot(),
    prisma.user.findMany({
      where: { deletedAt: null, status: { not: "dismissed" } },
      select: {
        id: true,
        lastName: true,
        firstName: true,
        middleName: true,
        position: { select: { name: true } },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
  ]);
  return (
    <WorkBoard
      initial={snapshot}
      people={people.map((person) => ({
        id: person.id,
        name: fullName(person),
        position: person.position?.name ?? "",
      }))}
    />
  );
}
