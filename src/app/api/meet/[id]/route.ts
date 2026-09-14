import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notifyMany } from "@/lib/notify";
import { requireMeetAccess, serializeMeet } from "@/lib/meet";

async function fileRows(ids: string[]) {
  if (!ids.length) return [];
  return prisma.storedFile.findMany({
    where: { id: { in: ids } },
    select: { id: true, originalName: true, mimeType: true, size: true },
  });
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await ctx.params;
  const meet = await requireMeetAccess(session.user, id);
  if (!meet) return NextResponse.json({ error: "Нет совещания" }, { status: 404 });
  const recs = await fileRows(meet.files.map((f) => f.fileId));
  return NextResponse.json(serializeMeet(meet, session.user.id, recs));
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await ctx.params;
  const meet = await requireMeetAccess(session.user, id);
  if (!meet) return NextResponse.json({ error: "Нет совещания" }, { status: 404 });
  const body = await req.json().catch(() => null);

  if (typeof body?.rsvp === "string") {
    const rsvp = body.rsvp === "no" ? "no" : body.rsvp === "yes" ? "yes" : "";
    if (!rsvp) return NextResponse.json({ error: "Ответ" }, { status: 400 });
    await prisma.meetingParticipant.upsert({
      where: { meetingId_userId: { meetingId: id, userId: session.user.id } },
      create: { meetingId: id, userId: session.user.id, rsvp },
      update: { rsvp },
    });
  }

  if (meet.authorId === session.user.id) {
    const data: { status?: string; title?: string; body?: string; place?: string; startsAt?: Date; endsAt?: Date } = {};
    if (body?.status === "live" || body?.status === "done" || body?.status === "cancelled") data.status = body.status;
    if (typeof body?.title === "string" && body.title.trim()) data.title = body.title.trim().slice(0, 200);
    if (typeof body?.body === "string") data.body = body.body.trim().slice(0, 4000);
    if (typeof body?.place === "string") data.place = body.place.trim().slice(0, 120);
    if (body?.startsAt) {
      const d = new Date(body.startsAt);
      if (!Number.isNaN(d.getTime())) data.startsAt = d;
    }
    if (body?.endsAt) {
      const d = new Date(body.endsAt);
      if (!Number.isNaN(d.getTime())) data.endsAt = d;
    }
    if (Object.keys(data).length) {
      await prisma.meeting.update({ where: { id }, data });
      if (meet.calendarEventId) {
        await prisma.calendarEvent.update({
          where: { id: meet.calendarEventId },
          data: {
            title: `Совещание: ${data.title || meet.title}`,
            body: data.place ?? meet.place,
            startsAt: data.startsAt || meet.startsAt,
            endsAt: data.endsAt || meet.endsAt,
            ...(data.status === "cancelled" ? { deletedAt: new Date() } : {}),
          },
        }).catch(() => {});
      }
      if (data.status === "live") {
        await notifyMany(
          meet.participants.filter((p) => p.userId !== session.user.id).map((p) => p.userId),
          { title: "Созвон начался", body: meet.title, link: `/meet/${id}/room`, urgency: "urgent" },
        );
      }
      if (data.status === "cancelled") {
        await notifyMany(
          meet.participants.filter((p) => p.userId !== session.user.id).map((p) => p.userId),
          { title: "Совещание отменено", body: meet.title, link: `/meet/${id}`, urgency: "info" },
        );
      }
      if (data.status === "done") {
        await prisma.meetingPeer.updateMany({
          where: { meetingId: id, leftAt: null },
          data: { leftAt: new Date() },
        });
        await prisma.meetingSignal.create({
          data: { meetingId: id, fromUserId: session.user.id, toUserId: "", kind: "bye", payload: "" },
        });
      }
    }
  }

  const next = await requireMeetAccess(session.user, id);
  if (!next) return NextResponse.json({ error: "Нет совещания" }, { status: 404 });
  const recs = await fileRows(next.files.map((f) => f.fileId));
  return NextResponse.json(serializeMeet(next, session.user.id, recs));
}
