import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/chat-server";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await ctx.params;
  const member = await requireMember(session.user, id);
  if (!member) return NextResponse.json({ error: "Нет чата" }, { status: 404 });
  if (!member.id) return NextResponse.json({ ok: true });
  const body = await req.json().catch(() => null);
  const messageId = String(body?.messageId || "").slice(0, 40);
  await prisma.chatMember.update({
    where: { id: member.id },
    data: { unreadCount: 0, lastReadAt: new Date(), lastReadMessageId: messageId },
  });
  return NextResponse.json({ ok: true });
}
