import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await params;
  await prisma.documentRecipient.updateMany({
    where: { documentId: id, userId: session.user.id, viewedAt: null },
    data: { viewedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
