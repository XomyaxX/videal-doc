import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { findOrCreateDirect } from "@/lib/chat-server";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const otherId = String(body?.userId || "");
  if (!otherId || otherId === session.user.id) {
    return NextResponse.json({ error: "Нет собеседника" }, { status: 400 });
  }
  const other = await prisma.user.findFirst({
    where: { id: otherId, deletedAt: null, status: "active" },
    select: { id: true },
  });
  if (!other) return NextResponse.json({ error: "Нет такого сотрудника" }, { status: 404 });

  const chat = await findOrCreateDirect(session.user.id, otherId);
  if (!chat.existing) {
    await audit({ userId: session.user.id, action: "chat.direct", entity: "chat", entityId: chat.id });
  }
  return NextResponse.json({ id: chat.id, existing: chat.existing });
}
