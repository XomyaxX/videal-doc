import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await params;
  const rec = await prisma.documentRecipient.findUnique({
    where: { documentId_userId: { documentId: id, userId: session.user.id } },
    include: { document: true },
  });
  if (!rec || !rec.isApprover) return NextResponse.json({ error: "Вы не согласующий" }, { status: 403 });
  if (rec.rejectedAt) return NextResponse.json({ error: "Уже отказ" }, { status: 400 });
  const now = new Date();
  await prisma.documentRecipient.update({
    where: { id: rec.id },
    data: { viewedAt: rec.viewedAt || now, approvedAt: now },
  });
  const pending = await prisma.documentRecipient.count({
    where: { documentId: id, isApprover: true, approvedAt: null, rejectedAt: null },
  });
  const rejected = await prisma.documentRecipient.count({
    where: { documentId: id, isApprover: true, rejectedAt: { not: null } },
  });
  const title =
    pending === 0 && rejected === 0
      ? "Документ согласован всеми"
      : pending === 0
        ? "Согласование завершено (есть отказ)"
        : "Документ согласован";
  await notify({
    userId: rec.document.authorId,
    title,
    body: `${session.user.fullName}: ${rec.document.title}`,
    link: `/documents/${id}`,
    urgency: "normal",
  });
  await audit({ userId: session.user.id, action: "document.approve", entity: "document", entityId: id });
  return NextResponse.json({ ok: true });
}
