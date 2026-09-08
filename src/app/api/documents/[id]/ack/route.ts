import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { archiveAck } from "@/lib/archive";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await params;
  const rec = await prisma.documentRecipient.findUnique({
    where: { documentId_userId: { documentId: id, userId: session.user.id } },
    include: { document: true },
  });
  if (!rec) return NextResponse.json({ error: "Документ вам не назначен" }, { status: 404 });
  if (!rec.viewedAt) return NextResponse.json({ error: "Сначала откройте файл" }, { status: 400 });
  if (rec.rejectedAt) return NextResponse.json({ error: "Вы уже отказались" }, { status: 400 });
  const ackedAt = new Date();
  await prisma.documentRecipient.update({
    where: { id: rec.id },
    data: {
      ackedAt,
      ackIp: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "",
    },
  });
  await audit({
    userId: session.user.id,
    action: "document.ack",
    entity: "document",
    entityId: id,
  });
  await archiveAck({
    documentId: id,
    number: rec.document.number,
    title: rec.document.title,
    userId: session.user.id,
    ackedAt,
    originalFileId: rec.document.originalFileId,
  });
  return NextResponse.json({ ok: true });
}
