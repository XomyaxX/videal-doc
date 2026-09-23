import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { meetActor } from "@/lib/meet-guest";
import { fullName } from "@/lib/names";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const actor = await meetActor(id);
  if (!actor) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  const rows = await prisma.meetingChatMessage.findMany({
    where: { meetingId: id },
    include: {
      author: { select: { lastName: true, firstName: true, middleName: true } },
      guest: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  return NextResponse.json({
    messages: rows.map((m) => {
      const name = m.guest?.name ? `${m.guest.name} (гость)` : m.author ? fullName(m.author) : "Участник";
      const who = m.guestId || m.authorId || "";
      return {
        id: m.id,
        authorId: who,
        name,
        body: m.body,
        mine: who === actor.id,
        at: m.createdAt.toISOString(),
      };
    }),
  });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const actor = await meetActor(id);
  if (!actor) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  const meet = await prisma.meeting.findFirst({ where: { id, deletedAt: null } });
  if (!meet || meet.status === "cancelled") return NextResponse.json({ error: "Совещание отменено" }, { status: 400 });
  const body = await req.json().catch(() => null);
  const text = String(body?.body || "")
    .replace(/<[^>]+>/g, "")
    .trim()
    .slice(0, 2000);
  if (!text) return NextResponse.json({ error: "Напишите сообщение" }, { status: 400 });
  const row = await prisma.meetingChatMessage.create({
    data: {
      meetingId: id,
      authorId: actor.guest ? null : actor.id,
      guestId: actor.guest ? actor.id : null,
      body: text,
    },
    include: {
      author: { select: { lastName: true, firstName: true, middleName: true } },
      guest: { select: { name: true } },
    },
  });
  const name = row.guest?.name ? `${row.guest.name} (гость)` : row.author ? fullName(row.author) : actor.name;
  return NextResponse.json({
    message: {
      id: row.id,
      authorId: actor.id,
      name,
      body: row.body,
      mine: true,
      at: row.createdAt.toISOString(),
    },
  });
}
