import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const reason = String(body?.reason || "").trim();
  if (reason.length < 3) return NextResponse.json({ error: "Напишите причину" }, { status: 400 });
  const rec = await prisma.documentRecipient.findUnique({
    where: { documentId_userId: { documentId: id, userId: session.user.id } },
    include: { document: true },
  });
  if (!rec) return NextResponse.json({ error: "Документ вам не назначен" }, { status: 404 });
  await prisma.documentRecipient.update({
    where: { id: rec.id },
    data: { rejectedAt: new Date(), rejectReason: reason },
  });
  await notify({
    userId: rec.document.authorId,
    title: "Отказ по документу",
    body: `${session.user.fullName}: ${reason}`,
    link: `/documents/${id}`,
    urgency: "urgent",
  });
  await audit({ userId: session.user.id, action: "document.reject", entity: "document", entityId: id, details: reason });
  return NextResponse.json({ ok: true });
}
