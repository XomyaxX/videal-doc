import { prisma } from "./prisma";
import { canLeadProd } from "./prod";
import { fullName } from "./names";
import type { SessionUser } from "./types";

export const MEET_PLACES = ["Переговорка", "Онлайн", "Гибрид"] as const;
export const MEET_DURATIONS = [30, 45, 60, 90] as const;

export function canCreateMeet(user: SessionUser) {
  return canLeadProd(user);
}

export async function requireMeetAccess(user: SessionUser, meetingId: string) {
  const meet = await prisma.meeting.findFirst({
    where: { id: meetingId, deletedAt: null },
    include: {
      author: { select: { id: true, lastName: true, firstName: true, middleName: true, photoFileId: true } },
      participants: {
        include: { user: { select: { id: true, lastName: true, firstName: true, middleName: true, photoFileId: true } } },
      },
      files: true,
    },
  });
  if (!meet) return null;
  const invited = meet.authorId === user.id || meet.participants.some((p) => p.userId === user.id);
  if (!invited) return null;
  return meet;
}

export function canJoinNow(meet: { status: string; startsAt: Date; endsAt: Date }) {
  if (meet.status === "cancelled" || meet.status === "done") return false;
  if (meet.status === "live") return true;
  const now = Date.now();
  return now >= meet.startsAt.getTime() - 10 * 60 * 1000 && now <= meet.endsAt.getTime() + 30 * 60 * 1000;
}

export function serializeMeet(
  meet: {
    id: string;
    title: string;
    body: string;
    place: string;
    startsAt: Date;
    endsAt: Date;
    status: string;
    authorId: string;
    author: { id: string; lastName: string; firstName: string; middleName: string; photoFileId: string };
    participants: {
      userId: string;
      rsvp: string;
      user: { id: string; lastName: string; firstName: string; middleName: string; photoFileId: string };
    }[];
    files: { id: string; fileId: string; previewFileId?: string }[];
  },
  meId: string,
  fileRows?: { id: string; originalName: string; mimeType: string; size: number }[],
) {
  const byId = Object.fromEntries((fileRows || []).map((f) => [f.id, f]));
  return {
    id: meet.id,
    title: meet.title,
    body: meet.body,
    place: meet.place,
    startsAt: meet.startsAt.toISOString(),
    endsAt: meet.endsAt.toISOString(),
    status: meet.status,
    authorId: meet.authorId,
    authorName: fullName(meet.author),
    authorPhoto: meet.author.photoFileId,
    canHost: meet.authorId === meId,
    canJoin: canJoinNow(meet),
    myRsvp: meet.participants.find((p) => p.userId === meId)?.rsvp || (meet.authorId === meId ? "yes" : "pending"),
    participants: meet.participants.map((p) => ({
      id: p.user.id,
      fullName: fullName(p.user),
      photoFileId: p.user.photoFileId,
      rsvp: p.rsvp,
      host: p.userId === meet.authorId,
    })),
    files: meet.files.map((f) => {
      const rec = byId[f.fileId];
      return {
        id: f.fileId,
        name: rec?.originalName || "файл",
        mime: rec?.mimeType || "",
        size: rec?.size || 0,
        previewFileId: f.previewFileId || "",
      };
    }),
  };
}
