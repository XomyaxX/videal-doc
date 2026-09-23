import { cookies } from "next/headers";
import { prisma } from "./prisma";
import { getSession } from "./auth";
import { requireMeetAccess } from "./meet";
import { randomToken } from "./password";

export const GUEST_COOKIE = "vd_meet_guest";

export type MeetActor = {
  id: string;
  name: string;
  guest: boolean;
  meetingId: string;
  canHost: boolean;
};

export async function guestFromCookie() {
  const jar = await cookies();
  const token = jar.get(GUEST_COOKIE)?.value || "";
  if (!token || token.length < 16) return null;
  return prisma.meetingGuest.findUnique({
    where: { cookie: token },
    include: { meeting: { select: { id: true, status: true, deletedAt: true, guestEnabled: true, title: true } } },
  });
}

export async function meetActor(meetingId: string): Promise<MeetActor | null> {
  const session = await getSession();
  if (session) {
    const meet = await requireMeetAccess(session.user, meetingId);
    if (!meet) return null;
    return {
      id: session.user.id,
      name: session.user.fullName,
      guest: false,
      meetingId: meet.id,
      canHost: meet.authorId === session.user.id,
    };
  }
  const guest = await guestFromCookie();
  if (!guest || guest.meetingId !== meetingId) return null;
  if (guest.meeting.deletedAt || !guest.meeting.guestEnabled) return null;
  if (guest.meeting.status === "cancelled") return null;
  return {
    id: guest.id,
    name: guest.name,
    guest: true,
    meetingId: guest.meetingId,
    canHost: false,
  };
}

export function parseGuestName(raw: unknown) {
  const name = String(raw || "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  if (name.length < 2) return "";
  return name;
}

export function newGuestCookie() {
  return randomToken(24);
}

export function newGuestLinkToken() {
  return randomToken(18);
}
