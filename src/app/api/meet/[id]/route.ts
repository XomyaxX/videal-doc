import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notifyMany } from "@/lib/notify";
import { parseDestinations, requireMeetAccess, serializeMeet } from "@/lib/meet";

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
  if (!meet) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  const recs = await fileRows(meet.files.map((f) => f.fileId));
  return NextResponse.json(serializeMeet(meet, session.user.id, recs, { myName: session.user.fullName }));
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await ctx.params;
  const meet = await requireMeetAccess(session.user, id);
  if (!meet) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
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
    const data: {
      status?: string;
      title?: string;
      body?: string;
      place?: string;
      startsAt?: Date;
      endsAt?: Date;
      endedAt?: Date | null;
      recordConsent?: boolean;
      guestEnabled?: boolean;
      guestToken?: string;
      speakerLeft?: string;
      speakerRight?: string;
      transcript?: string;
      visibility?: string;
      destinations?: string;
    } = {};
    if (body?.status === "live" || body?.status === "done" || body?.status === "cancelled") data.status = body.status;
    if (data.status === "done") data.endedAt = new Date();
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
    if (typeof body?.recordConsent === "boolean") data.recordConsent = body.recordConsent;
    if (typeof body?.transcript === "string") data.transcript = String(body.transcript).slice(0, 400000);
    if (typeof body?.speakerLeft === "string") data.speakerLeft = String(body.speakerLeft).trim().slice(0, 80) || "Организатор";
    if (typeof body?.speakerRight === "string") data.speakerRight = String(body.speakerRight).trim().slice(0, 80) || "Участники";
    if (typeof body?.guestEnabled === "boolean") {
      data.guestEnabled = body.guestEnabled;
      if (body.guestEnabled && !meet.guestToken) {
        const { newGuestLinkToken } = await import("@/lib/meet-guest");
        data.guestToken = newGuestLinkToken();
      }
    }
    if (body?.visibility === "participants" || body?.visibility === "participants_and_managers" || body?.visibility === "custom") {
      data.visibility = body.visibility;
    }
    if (body?.destinations) data.destinations = JSON.stringify(parseDestinations(JSON.stringify(body.destinations)));
    if (Array.isArray(body?.viewerIds)) {
      await prisma.meetingViewer.deleteMany({ where: { meetingId: id } });
      const vids = body.viewerIds.map(String).filter((uid: string) => uid && uid !== meet.authorId);
      if (vids.length) await prisma.meetingViewer.createMany({ data: vids.map((userId: string) => ({ meetingId: id, userId })) });
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
  return NextResponse.json(serializeMeet(next, session.user.id, recs, { myName: session.user.fullName }));
}
