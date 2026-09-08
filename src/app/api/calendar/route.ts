import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notifyMany } from "@/lib/notify";
import { audit } from "@/lib/audit";
import { officeYmd } from "@/lib/dates";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  const events = await prisma.calendarEvent.findMany({
    where: {
      deletedAt: null,
      startsAt: to ? { lte: new Date(to) } : undefined,
      endsAt: from ? { gte: new Date(from) } : undefined,
      OR: [{ authorId: session.user.id }, { participants: { some: { userId: session.user.id } } }],
    },
    include: {
      author: { select: { id: true, lastName: true, firstName: true, middleName: true } },
      participants: {
        include: { user: { select: { id: true, lastName: true, firstName: true, middleName: true } } },
      },
    },
    orderBy: { startsAt: "asc" },
  });
  return NextResponse.json({ events });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const title = String(body?.title || "").trim();
  if (!title) return NextResponse.json({ error: "Название события" }, { status: 400 });
  const startsAt = new Date(body?.startsAt);
  const endsAt = body?.endsAt ? new Date(body.endsAt) : startsAt;
  if (Number.isNaN(startsAt.getTime())) return NextResponse.json({ error: "Дата начала" }, { status: 400 });
  const day = String(body?.startsAt || "").slice(0, 10);
  if (day && day < officeYmd()) {
    return NextResponse.json({ error: "Нельзя поставить событие на прошедшую дату" }, { status: 400 });
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
  const event = await prisma.calendarEvent.create({
    data: {
      title,
      body: String(body?.body || ""),
      startsAt,
      endsAt,
      allDay: Boolean(body?.allDay),
      color: String(body?.color || "navy"),
      authorId: session.user.id,
      participants: { create: ids.map((userId) => ({ userId })) },
    },
  });
  await notifyMany(
    ids.filter((id) => id !== session.user.id),
    { title: "Новое событие в календаре", body: title, link: "/calendar", urgency: "info" },
  );
  await audit({ userId: session.user.id, action: "calendar.create", entity: "calendar", entityId: event.id });
  return NextResponse.json({ id: event.id });
}
