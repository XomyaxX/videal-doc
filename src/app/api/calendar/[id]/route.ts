import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notifyMany } from "@/lib/notify";
import { audit } from "@/lib/audit";
import { officeYmd } from "@/lib/dates";

async function loadMine(id: string, userId: string) {
  const ev = await prisma.calendarEvent.findFirst({ where: { id, deletedAt: null } });
  if (!ev) return { error: NextResponse.json({ error: "Не найдено" }, { status: 404 }) };
  if (ev.authorId !== userId) return { error: NextResponse.json({ error: "Только автор" }, { status: 403 }) };
  return { ev };
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await params;
  const found = await loadMine(id, session.user.id);
  if (found.error) return found.error;
  const ev = found.ev!;
  const body = await req.json().catch(() => null);
  const title = String(body?.title || "").trim();
  if (!title) return NextResponse.json({ error: "Название события" }, { status: 400 });
  const startsAt = new Date(body?.startsAt);
  const endsAt = body?.endsAt ? new Date(body.endsAt) : startsAt;
  if (Number.isNaN(startsAt.getTime())) return NextResponse.json({ error: "Дата начала" }, { status: 400 });
  const day = String(body?.startsAt || "").slice(0, 10);
  const oldDay = officeYmd(ev.startsAt);
  if (day && day !== oldDay && day < officeYmd()) {
    return NextResponse.json({ error: "Нельзя перенести событие на прошедшую дату" }, { status: 400 });
  }
  let ids: string[] = Array.isArray(body?.participantIds) ? body.participantIds.map(String) : [];
  const departmentId = String(body?.departmentId || "");
  if (departmentId) {
    const dept = await prisma.user.findMany({
      where: { deletedAt: null, status: "active", departmentId },
      select: { id: true },
    });
    ids = dept.map((d) => d.id);
  }
  if (!ids.includes(session.user.id)) ids.push(session.user.id);
  ids = Array.from(new Set(ids));
  const prev = await prisma.calendarParticipant.findMany({ where: { eventId: id }, select: { userId: true } });
  const prevIds = new Set(prev.map((p) => p.userId));
  await prisma.calendarEvent.update({
    where: { id },
    data: {
      title,
      body: String(body?.body || ""),
      startsAt,
      endsAt,
      allDay: Boolean(body?.allDay),
      color: String(body?.color || ev.color || "navy"),
      participants: {
        deleteMany: {},
        create: ids.map((userId) => ({ userId })),
      },
    },
  });
  const added = ids.filter((uid) => uid !== session.user.id && !prevIds.has(uid));
  if (added.length) {
    await notifyMany(added, { title: "Вас добавили в событие", body: title, link: "/calendar", urgency: "info" });
  }
  await audit({ userId: session.user.id, action: "calendar.update", entity: "calendar", entityId: id });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await params;
  const found = await loadMine(id, session.user.id);
  if (found.error) return found.error;
  await prisma.calendarEvent.update({ where: { id }, data: { deletedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
