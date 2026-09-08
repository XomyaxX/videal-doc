import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/chat-server";

const ALLOWED = new Set(["👍", "❤️", "😂", "😮", "😢", "🔥", "👏", "✅"]);

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; mid: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id, mid } = await ctx.params;
  const member = await requireMember(session.user, id);
  if (!member) return NextResponse.json({ error: "Нет чата" }, { status: 404 });
  const body = await req.json().catch(() => null);
  const emoji = String(body?.emoji || "");
  if (!ALLOWED.has(emoji)) return NextResponse.json({ error: "Этот значок нельзя" }, { status: 400 });
  const msg = await prisma.chatMessage.findFirst({ where: { id: mid, chatId: id, deletedAt: null }, select: { id: true } });
  if (!msg) return NextResponse.json({ error: "Нет сообщения" }, { status: 404 });
  const existing = await prisma.chatReaction.findUnique({
    where: { messageId_userId_emoji: { messageId: mid, userId: session.user.id, emoji } },
  });
  if (existing) {
    await prisma.chatReaction.delete({ where: { id: existing.id } });
    return NextResponse.json({ ok: true, on: false });
  }
  await prisma.chatReaction.create({ data: { messageId: mid, userId: session.user.id, emoji } });
  return NextResponse.json({ ok: true, on: true });
}
