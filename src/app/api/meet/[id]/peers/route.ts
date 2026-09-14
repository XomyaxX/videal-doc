import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canJoinNow, requireMeetAccess } from "@/lib/meet";
import { fullName } from "@/lib/names";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await ctx.params;
  const meet = await requireMeetAccess(session.user, id);
  if (!meet) return NextResponse.json({ error: "Нет совещания" }, { status: 404 });
  const stale = new Date(Date.now() - 20 * 1000);
  await prisma.meetingPeer.updateMany({
    where: { meetingId: id, leftAt: null, updatedAt: { lt: stale } },
    data: { leftAt: new Date() },
  });
  const peers = await prisma.meetingPeer.findMany({
    where: { meetingId: id, leftAt: null },
    include: { user: { select: { id: true, lastName: true, firstName: true, middleName: true, photoFileId: true } } },
  });
  return NextResponse.json({
    status: meet.status,
    peers: peers.map((p) => ({
      id: p.userId,
      fullName: fullName(p.user),
      photoFileId: p.user.photoFileId,
      audioOn: p.audioOn,
      videoOn: p.videoOn,
      screenOn: p.screenOn,
    })),
  });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await ctx.params;
  const meet = await requireMeetAccess(session.user, id);
  if (!meet) return NextResponse.json({ error: "Нет совещания" }, { status: 404 });
  if (!canJoinNow(meet) && meet.authorId !== session.user.id) {
    return NextResponse.json({ error: "Созвон ещё не начался" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  if (body?.leave) {
    await prisma.meetingPeer.updateMany({
      where: { meetingId: id, userId: session.user.id, leftAt: null },
      data: { leftAt: new Date() },
    });
    await prisma.meetingSignal.create({
      data: { meetingId: id, fromUserId: session.user.id, toUserId: "", kind: "leave", payload: "" },
    });
    return NextResponse.json({ ok: true });
  }
  const audioOn = body?.audioOn !== false;
  const videoOn = body?.videoOn !== false;
  const screenOn = Boolean(body?.screenOn);
  await prisma.meetingPeer.upsert({
    where: { meetingId_userId: { meetingId: id, userId: session.user.id } },
    create: {
      meetingId: id,
      userId: session.user.id,
      audioOn,
      videoOn,
      screenOn,
      leftAt: null,
    },
    update: { audioOn, videoOn, screenOn, leftAt: null },
  });
  if (meet.status === "scheduled" && meet.authorId === session.user.id) {
    await prisma.meeting.update({ where: { id }, data: { status: "live" } });
  }
  await prisma.meetingParticipant.updateMany({
    where: { meetingId: id, userId: session.user.id },
    data: { joinedAt: new Date(), rsvp: "yes" },
  });
  return NextResponse.json({ ok: true });
}
