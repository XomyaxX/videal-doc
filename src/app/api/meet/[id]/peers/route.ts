import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canJoinNow } from "@/lib/meet";
import { meetActor } from "@/lib/meet-guest";
import { fullName } from "@/lib/names";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const actor = await meetActor(id);
  if (!actor) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  const meet = await prisma.meeting.findFirst({ where: { id, deletedAt: null } });
  if (!meet) return NextResponse.json({ error: "Нет совещания" }, { status: 404 });
  const stale = new Date(Date.now() - 20 * 1000);
  await prisma.meetingPeer.updateMany({
    where: { meetingId: id, leftAt: null, updatedAt: { lt: stale } },
    data: { leftAt: new Date() },
  });
  const peers = await prisma.meetingPeer.findMany({
    where: { meetingId: id, leftAt: null },
    include: {
      user: { select: { id: true, lastName: true, firstName: true, middleName: true, photoFileId: true } },
      guest: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json({
    status: meet.status,
    peers: peers.map((p) => {
      const pid = p.userId || p.guestId || p.id;
      const label = p.guest?.name || (p.user ? fullName(p.user) : "Гость");
      return {
        id: pid,
        fullName: p.guest ? `${label} (гость)` : label,
        photoFileId: p.user?.photoFileId || "",
        audioOn: p.audioOn,
        videoOn: p.videoOn,
        screenOn: p.screenOn,
      };
    }),
  });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const actor = await meetActor(id);
  if (!actor) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  const meet = await prisma.meeting.findFirst({ where: { id, deletedAt: null } });
  if (!meet) return NextResponse.json({ error: "Нет совещания" }, { status: 404 });
  if (!canJoinNow(meet) && meet.status !== "live" && !actor.canHost) {
    return NextResponse.json({ error: "Созвон ещё не начался" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  if (body?.leave) {
    await prisma.meetingPeer.updateMany({
      where: actor.guest
        ? { meetingId: id, guestId: actor.id, leftAt: null }
        : { meetingId: id, userId: actor.id, leftAt: null },
      data: { leftAt: new Date() },
    });
    await prisma.meetingSignal.create({
      data: { meetingId: id, fromUserId: actor.id, toUserId: "", kind: "leave", payload: "" },
    });
    return NextResponse.json({ ok: true });
  }
  const audioOn = body?.audioOn !== false;
  const videoOn = body?.videoOn !== false;
  const screenOn = Boolean(body?.screenOn);
  const existing = await prisma.meetingPeer.findFirst({
    where: actor.guest ? { meetingId: id, guestId: actor.id } : { meetingId: id, userId: actor.id },
  });
  if (existing) {
    await prisma.meetingPeer.update({
      where: { id: existing.id },
      data: { audioOn, videoOn, screenOn, leftAt: null },
    });
  } else {
    await prisma.meetingPeer.create({
      data: {
        meetingId: id,
        userId: actor.guest ? null : actor.id,
        guestId: actor.guest ? actor.id : null,
        audioOn,
        videoOn,
        screenOn,
        leftAt: null,
      },
    });
  }
  if (meet.status === "scheduled" && actor.canHost) {
    await prisma.meeting.update({ where: { id }, data: { status: "live" } });
  }
  if (!actor.guest) {
    await prisma.meetingParticipant.updateMany({
      where: { meetingId: id, userId: actor.id },
      data: { joinedAt: new Date(), rsvp: "yes" },
    });
  }
  return NextResponse.json({ ok: true });
}
