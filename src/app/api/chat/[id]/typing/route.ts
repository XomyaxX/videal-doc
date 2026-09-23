import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { requireMember } from "@/lib/chat-server";
import { setTyping, typingUserIds } from "@/lib/chat-typing";
import { fullName } from "@/lib/names";
import { prisma } from "@/lib/prisma";

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await ctx.params;
  const member = await requireMember(session.user, id);
  if (!member?.canWrite) return NextResponse.json({ error: "Нет чата" }, { status: 404 });
  setTyping(id, session.user.id);
  return NextResponse.json({ ok: true });
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await ctx.params;
  const member = await requireMember(session.user, id);
  if (!member) return NextResponse.json({ error: "Нет чата" }, { status: 404 });
  const ids = typingUserIds(id, session.user.id);
  if (!ids.length) return NextResponse.json({ names: [] });
  const people = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, lastName: true, firstName: true, middleName: true },
  });
  const order = new Map(ids.map((x, i) => [x, i]));
  people.sort((a, b) => (order.get(a.id) || 0) - (order.get(b.id) || 0));
  return NextResponse.json({ names: people.map((p) => fullName(p)) });
}
