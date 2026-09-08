import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function ScanPage() {
  const user = await requireUser();
  const draft = await prisma.advanceReport.findFirst({
    where: { userId: user.id, deletedAt: null, status: { in: ["draft", "rework"] } },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });
  redirect(draft ? `/advances/${draft.id}` : "/advances/new");
}
