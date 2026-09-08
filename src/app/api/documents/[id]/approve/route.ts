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
  await prisma.documentRecipient.update({
    where: { id: rec.id },
    data: { approvedAt: new Date() },
  });
  const left = await prisma.documentRecipient.count({
    where: { documentId: id, isApprover: true, approvedAt: null, rejectedAt: null },
  });
  await notify({
    userId: rec.document.authorId,
    title: left === 0 ? "Документ согласован всеми" : "Документ согласован",
    body: `${session.user.fullName}: ${rec.document.title}`,
    link: `/documents/${id}`,
    urgency: "normal",
  });
  await audit({ userId: session.user.id, action: "document.approve", entity: "document", entityId: id });
  return NextResponse.json({ ok: true });
}
