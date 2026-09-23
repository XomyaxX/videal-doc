import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { canLeadProd } from "./prod";
import { fullName } from "./names";
import { userCan, type SessionUser } from "./types";

export const MEET_PLACES = ["Переговорка", "Онлайн", "Гибрид"] as const;
export const MEET_DURATIONS = [30, 45, 60, 90] as const;
export const MEET_VISIBILITY = ["participants", "participants_and_managers", "custom"] as const;
export const MEET_DESTINATIONS = ["meeting_card", "notify_participants", "attach_document"] as const;

export type MeetVisibility = (typeof MEET_VISIBILITY)[number];

export function canCreateMeet(user: SessionUser) {
  return canLeadProd(user);
}

export function isMeetManager(user: SessionUser) {
  return (
    userCan(user, "users.manage") ||
    user.roleCode === "superadmin" ||
    user.roleCode === "admin" ||
    user.roleCode === "manager"
  );
}

export function parseDestinations(raw?: string | null): string[] {
  try {
    const v = JSON.parse(raw || "[]");
    if (!Array.isArray(v)) return ["meeting_card", "notify_participants"];
    const out = v.map(String).filter((x) => MEET_DESTINATIONS.includes(x as (typeof MEET_DESTINATIONS)[number]));
    if (!out.includes("meeting_card")) out.unshift("meeting_card");
    return out;
  } catch {
    return ["meeting_card", "notify_participants"];
  }
}

export function parseDelivered(raw?: string | null): Record<string, string> {
  try {
    const v = JSON.parse(raw || "{}");
    return v && typeof v === "object" ? (v as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function parseSummaryJson(raw?: string | null): {
  title: string;
  theses: string[];
  decisions: string[];
  actions: { task: string; brief: string; owner: string; due: string }[];
  open_questions: string[];
  risks: string[];
  summaryMarkdown: string;
} | null {
  try {
    const v = JSON.parse(raw || "");
    if (!v || typeof v !== "object") return null;
    return {
      title: String(v.title || ""),
      theses: Array.isArray(v.theses) ? v.theses.map(String) : [],
      decisions: Array.isArray(v.decisions) ? v.decisions.map(String) : [],
      actions: Array.isArray(v.actions)
        ? v.actions.map((a: { task?: string; title?: string; brief?: string; owner?: string; ownerHint?: string; due?: string }) => ({
            task: String(a?.task || a?.title || ""),
            brief: String(a?.brief || ""),
            owner: String(a?.owner || a?.ownerHint || ""),
            due: String(a?.due || ""),
          }))
        : [],
      open_questions: Array.isArray(v.open_questions) ? v.open_questions.map(String) : [],
      risks: Array.isArray(v.risks) ? v.risks.map(String) : [],
      summaryMarkdown: String(v.summaryMarkdown || ""),
    };
  } catch {
    return null;
  }
}

const meetInclude = {
  author: { select: { id: true, lastName: true, firstName: true, middleName: true, photoFileId: true } },
  participants: {
    include: { user: { select: { id: true, lastName: true, firstName: true, middleName: true, photoFileId: true } } },
  },
  files: true,
  viewers: { select: { userId: true } },
} as const;

export function meetListWhere(user: SessionUser): Prisma.MeetingWhereInput {
  if (user.roleCode === "superadmin" || userCan(user, "users.manage")) {
    return { deletedAt: null };
  }
  const or: Prisma.MeetingWhereInput[] = [
    { authorId: user.id },
    { participants: { some: { userId: user.id } } },
    { viewers: { some: { userId: user.id } } },
  ];
  if (isMeetManager(user)) or.push({ visibility: "participants_and_managers" });
  return { deletedAt: null, OR: or };
}

export function canSeeMeeting(
  user: SessionUser,
  meet: {
    authorId: string;
    visibility: string;
    participants: { userId: string }[];
    viewers?: { userId: string }[];
  },
) {
  if (user.roleCode === "superadmin" || userCan(user, "users.manage")) return true;
  if (meet.authorId === user.id) return true;
  if (meet.participants.some((p) => p.userId === user.id)) return true;
  if (meet.visibility === "custom" && meet.viewers?.some((v) => v.userId === user.id)) return true;
  if (meet.visibility === "participants_and_managers" && isMeetManager(user)) return true;
  return false;
}

export async function requireMeetAccess(user: SessionUser, meetingId: string) {
  const meet = await prisma.meeting.findFirst({
    where: { id: meetingId, deletedAt: null },
    include: meetInclude,
  });
  if (!meet) return null;
  if (!canSeeMeeting(user, meet)) return null;
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
    endedAt?: Date | null;
    status: string;
    authorId: string;
    recordConsent?: boolean;
    guestEnabled?: boolean;
    guestToken?: string;
    visibility?: string;
    destinations?: string;
    recordingFileId?: string;
    recordingStereo?: boolean;
    speakerLeft?: string;
    speakerRight?: string;
    summaryStatus?: string;
    summaryProgress?: number;
    transcript?: string;
    summaryJson?: string;
    summaryMarkdown?: string;
    summaryError?: string;
    summaryDeliveredAt?: Date | null;
    summaryDelivered?: string;
    summaryTaskIds?: string;
    author: { id: string; lastName: string; firstName: string; middleName: string; photoFileId: string };
    participants: {
      userId: string;
      rsvp: string;
      user: { id: string; lastName: string; firstName: string; middleName: string; photoFileId: string };
    }[];
    files: { id: string; fileId: string; previewFileId?: string }[];
    viewers?: { userId: string }[];
  },
  meId: string,
  fileRows?: { id: string; originalName: string; mimeType: string; size: number }[],
  extra?: { myName?: string },
) {
  const byId = Object.fromEntries((fileRows || []).map((f) => [f.id, f]));
  const dest = parseDestinations(meet.destinations);
  return {
    id: meet.id,
    title: meet.title,
    body: meet.body,
    place: meet.place,
    startsAt: meet.startsAt.toISOString(),
    endsAt: meet.endsAt.toISOString(),
    endedAt: meet.endedAt ? meet.endedAt.toISOString() : null,
    status: meet.status,
    authorId: meet.authorId,
    authorName: fullName(meet.author),
    authorPhoto: meet.author.photoFileId,
    canHost: meet.authorId === meId,
    canJoin: canJoinNow(meet),
    myRsvp: meet.participants.find((p) => p.userId === meId)?.rsvp || (meet.authorId === meId ? "yes" : "pending"),
    myName: extra?.myName || "",
    recordConsent: Boolean(meet.recordConsent),
    guestEnabled: Boolean(meet.guestEnabled),
    guestToken: meet.guestToken || "",
    visibility: (meet.visibility || "participants") as string,
    destinations: dest,
    viewerIds: (meet.viewers || []).map((v) => v.userId),
    recordingFileId: meet.recordingFileId || "",
    recordingStereo: Boolean(meet.recordingStereo),
    speakerLeft: meet.speakerLeft || "Организатор",
    speakerRight: meet.speakerRight || "Участники",
    summaryStatus: meet.summaryStatus || "none",
    summaryProgress: Math.max(0, Math.min(100, Number(meet.summaryProgress) || 0)),
    transcript: meet.transcript || "",
    summary: parseSummaryJson(meet.summaryJson),
    summaryMarkdown: meet.summaryMarkdown || "",
    summaryError: meet.summaryError || "",
    summaryDeliveredAt: meet.summaryDeliveredAt ? meet.summaryDeliveredAt.toISOString() : null,
    summaryDelivered: parseDelivered(meet.summaryDelivered),
    summaryTaskIds: (() => {
      try {
        const v = JSON.parse(meet.summaryTaskIds || "[]");
        return Array.isArray(v) ? v.map(String) : [];
      } catch {
        return [];
      }
    })(),
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
