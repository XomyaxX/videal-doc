import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await params;
  const ev = await prisma.calendarEvent.findFirst({ where: { id, deletedAt: null } });
  if (!ev) return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  if (ev.authorId !== session.user.id) return NextResponse.json({ error: "Удаляет только автор" }, { status: 403 });
  await prisma.calendarEvent.update({ where: { id }, data: { deletedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
