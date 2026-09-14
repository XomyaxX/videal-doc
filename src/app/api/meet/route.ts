import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notifyMany } from "@/lib/notify";
import { audit } from "@/lib/audit";
import { canCreateMeet, serializeMeet } from "@/lib/meet";

const include = {
  author: { select: { id: true, lastName: true, firstName: true, middleName: true, photoFileId: true } },
  participants: {
    include: { user: { select: { id: true, lastName: true, firstName: true, middleName: true, photoFileId: true } } },
  },
  files: true,
};

async function withFiles<T extends { files: { fileId: string }[] }>(rows: T[]) {
  const ids = [...new Set(rows.flatMap((r) => r.files.map((f) => f.fileId)))];
  const recs = ids.length
    ? await prisma.storedFile.findMany({ where: { id: { in: ids } }, select: { id: true, originalName: true, mimeType: true, size: true } })
    : [];
  return recs;
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const rows = await prisma.meeting.findMany({
    where: {
      deletedAt: null,
      OR: [{ authorId: session.user.id }, { participants: { some: { userId: session.user.id } } }],
    },
    include,
    orderBy: { startsAt: "asc" },
    take: 80,
  });
  const recs = await withFiles(rows);
  return NextResponse.json({
    meetings: rows.map((m) => serializeMeet(m, session.user.id, recs)),
    canCreate: canCreateMeet(session.user),
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  if (!canCreateMeet(session.user)) return NextResponse.json({ error: "Созывать может руководитель" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const title = String(body?.title || "").trim().slice(0, 200);
  if (!title) return NextResponse.json({ error: "Тема совещания" }, { status: 400 });
  const startsAt = new Date(body?.startsAt);
  const endsAt = body?.endsAt ? new Date(body.endsAt) : new Date(startsAt.getTime() + 60 * 60 * 1000);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return NextResponse.json({ error: "Дата и время" }, { status: 400 });
  }
  if (endsAt.getTime() <= startsAt.getTime()) return NextResponse.json({ error: "Окончание позже начала" }, { status: 400 });
  const place = String(body?.place || "").trim().slice(0, 120);
  let ids: string[] = Array.isArray(body?.participantIds) ? body.participantIds.map(String) : [];
  const departmentId = String(body?.departmentId || "");
  if (departmentId) {
    const dept = await prisma.user.findMany({
      where: { deletedAt: null, status: "active", departmentId },
      select: { id: true },
    });
    ids = [...ids, ...dept.map((d) => d.id)];
  }
  ids.push(session.user.id);
  ids = Array.from(new Set(ids));
  const live = await prisma.user.findMany({
    where: { id: { in: ids }, deletedAt: null, status: "active" },
    select: { id: true },
  });
  ids = live.map((u) => u.id);
  if (ids.length < 2) return NextResponse.json({ error: "Выберите, кто должен быть" }, { status: 400 });

  const cal = await prisma.calendarEvent.create({
    data: {
      title: `Совещание: ${title}`,
      body: place,
      startsAt,
      endsAt,
      authorId: session.user.id,
      color: "gold",
      participants: { create: ids.map((userId) => ({ userId })) },
    },
  });

  const meet = await prisma.meeting.create({
    data: {
      title,
      body: String(body?.body || "").trim().slice(0, 4000),
      place,
      startsAt,
      endsAt,
      authorId: session.user.id,
      calendarEventId: cal.id,
      participants: {
        create: ids.map((userId) => ({
          userId,
          rsvp: userId === session.user.id ? "yes" : "pending",
        })),
      },
    },
    include,
  });

  await notifyMany(
    ids.filter((id) => id !== session.user.id),
    {
      title: "Совещание",
      body: `${title} · ${place || "место не указано"}`,
      link: `/meet/${meet.id}`,
      urgency: "info",
    },
  );
  await audit({ userId: session.user.id, action: "meet.create", entity: "meeting", entityId: meet.id });
  return NextResponse.json(serializeMeet(meet, session.user.id, []));
}
