import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canHoldChatKey, lastSeenMap, openPayload, openTitle, payloadPreview, toPerson, touchChatSeen } from "@/lib/chat-server";
import { syncOfficialChats } from "@/lib/chat-official";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const all = req.nextUrl.searchParams.get("all") === "1" && canHoldChatKey(session.user);
  void touchChatSeen(session.user.id);
  await syncOfficialChats();

  const memberships = all
    ? await prisma.chat.findMany({
        include: {
          members: {
            where: { leftAt: null },
            include: {
              user: {
                select: {
                  id: true,
                  lastName: true,
                  firstName: true,
                  middleName: true,
                  photoFileId: true,
                  department: { select: { name: true } },
                },
              },
            },
          },
          messages: {
            where: { deletedAt: null },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { id: true, authorId: true, type: true, ciphertext: true, iv: true, createdAt: true },
          },
        },
      })
    : (
        await prisma.chatMember.findMany({
          where: { userId: session.user.id, leftAt: null },
          include: {
            chat: {
              include: {
                members: {
                  where: { leftAt: null },
                  include: {
                    user: {
                      select: {
                        id: true,
                        lastName: true,
                        firstName: true,
                        middleName: true,
                        photoFileId: true,
                        department: { select: { name: true } },
                      },
                    },
                  },
                },
                messages: {
                  where: { deletedAt: null },
                  orderBy: { createdAt: "desc" },
                  take: 1,
                  select: { id: true, authorId: true, type: true, ciphertext: true, iv: true, createdAt: true },
                },
              },
            },
          },
        })
      ).map((m) => ({ ...m.chat, _unread: m.unreadCount, _muted: m.mutedUntil, _pinned: m.pinnedAt, _role: m.role }));

  type Row = {
    id: string;
    kind: string;
    avatarFileId: string;
    titleCipher: string;
    titleIv: string;
    lastMessageAt: Date;
    members: {
      role: string;
      lastReadAt: Date | null;
      lastReadMessageId: string;
      user: {
        id: string;
        lastName: string;
        firstName: string;
        middleName: string;
        photoFileId: string;
        department: { name: string } | null;
      };
    }[];
    messages: { id: string; authorId: string; type: string; ciphertext: string; iv: string; createdAt: Date }[];
    _unread?: number;
    _muted?: Date | null;
    _pinned?: Date | null;
    _role?: string;
  };

  const rows = (all
    ? (memberships as Row[]).map((c) => ({ ...c, _unread: 0, _muted: null, _pinned: null, _role: "owner" }))
    : (memberships as Row[])) as Row[];

  const people = rows.flatMap((c) => c.members.map((x) => x.user));
  const seen = await lastSeenMap(people.map((p) => p.id));
  const chats = [];
  for (const c of rows) {
    const last = c.messages[0] || null;
    const payload = last ? await openPayload(last.iv, last.ciphertext) : null;
    const title =
      c.kind === "direct"
        ? ""
        : (await openTitle(c.titleIv, c.titleCipher)) || (c.kind === "studio" ? "Студия" : c.kind === "dept" ? "Отдел" : "Беседа");
    chats.push({
      id: c.id,
      kind: c.kind,
      avatarFileId: c.avatarFileId,
      title,
      lastMessageAt: c.lastMessageAt.toISOString(),
      unreadCount: c._unread || 0,
      mutedUntil: c._muted ? c._muted.toISOString() : null,
      pinnedAt: c._pinned ? c._pinned.toISOString() : null,
      role: c._role || "member",
      members: c.members.map((x) => ({
        ...toPerson(x.user, { hasIdentity: true, lastSeenAt: seen.get(x.user.id) || null }),
        role: x.role,
        lastReadAt: x.lastReadAt ? x.lastReadAt.toISOString() : null,
        lastReadMessageId: x.lastReadMessageId,
      })),
      last: last
        ? {
            id: last.id,
            authorId: last.authorId,
            type: last.type,
            preview: payloadPreview(payload) || "Сообщение",
            createdAt: last.createdAt.toISOString(),
          }
        : null,
    });
  }
  chats.sort((a, b) => {
    const rank = (k: string) => (k === "studio" ? 0 : k === "dept" ? 1 : 2);
    const ra = rank(a.kind);
    const rb = rank(b.kind);
    if (ra !== rb) return ra - rb;
    if (a.pinnedAt && !b.pinnedAt) return -1;
    if (!a.pinnedAt && b.pinnedAt) return 1;
    return b.lastMessageAt.localeCompare(a.lastMessageAt);
  });
  return NextResponse.json({ chats, canSeeAll: canHoldChatKey(session.user) });
}
