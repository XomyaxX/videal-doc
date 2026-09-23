import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canJoinNow } from "@/lib/meet";
import { GUEST_COOKIE, newGuestCookie, parseGuestName } from "@/lib/meet-guest";

export async function GET(req: NextRequest) {
  const token = String(req.nextUrl.searchParams.get("token") || "");
  const meet = await prisma.meeting.findFirst({
    where: { guestToken: token, deletedAt: null, guestEnabled: true },
    select: { id: true, title: true, startsAt: true, endsAt: true, status: true, place: true, recordConsent: true },
  });
  if (!meet || meet.status === "cancelled" || meet.status === "done") {
    return NextResponse.json({ error: "Ссылка недействительна или созвон уже закончился" }, { status: 404 });
  }
  return NextResponse.json({
    title: meet.title,
    place: meet.place,
    startsAt: meet.startsAt.toISOString(),
    endsAt: meet.endsAt.toISOString(),
    status: meet.status,
    recordConsent: meet.recordConsent,
    canJoin: canJoinNow(meet) || meet.status === "live",
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const token = String(body?.token || "");
  const name = parseGuestName(body?.name);
  if (!name) return NextResponse.json({ error: "Напишите фамилию и имя" }, { status: 400 });
  const meet = await prisma.meeting.findFirst({
    where: { guestToken: token, deletedAt: null, guestEnabled: true },
  });
  if (!meet || meet.status === "cancelled" || meet.status === "done") {
    return NextResponse.json({ error: "Ссылка недействительна или созвон уже закончился" }, { status: 404 });
  }
  if (!canJoinNow(meet) && meet.status !== "live") {
    return NextResponse.json({ error: "Созвон ещё не начался. Подождите организатора." }, { status: 403 });
  }
  const cookie = newGuestCookie();
  const guest = await prisma.meetingGuest.create({
    data: { meetingId: meet.id, name, cookie },
  });
  const res = NextResponse.json({ ok: true, meetingId: meet.id, guestId: guest.id, name: guest.name });
  res.cookies.set(GUEST_COOKIE, cookie, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 12 * 60 * 60,
    secure: req.nextUrl.protocol === "https:",
  });
  return res;
}
