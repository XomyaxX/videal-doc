import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdminRole, lastSeenMap, openTitle, requireMember, sealTitle, toPerson } from "@/lib/chat-server";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await ctx.params;
  const member = await requireMember(session.user, id);
  if (!member) return NextResponse.json({ error: "Нет чата" }, { status: 404 });
  const chat = await prisma.chat.findUnique({
    where: { id },
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
    },
  });
  if (!chat) return NextResponse.json({ error: "Нет чата" }, { status: 404 });
  const ids = chat.members.map((m) => m.user.id);
  const seen = await lastSeenMap(ids);
  const title =
    chat.kind === "direct"
      ? ""
      : (await openTitle(chat.titleIv, chat.titleCipher)) || (chat.kind === "studio" ? "Студия" : "Беседа");
  return NextResponse.json({
    id: chat.id,
    kind: chat.kind,
    official: chat.kind === "studio" || chat.kind === "dept",
    noMute: chat.kind === "studio",
    avatarFileId: chat.avatarFileId,
    title,
    lastMessageAt: chat.lastMessageAt.toISOString(),
    unreadCount: member.unreadCount,
    mutedUntil: member.mutedUntil ? member.mutedUntil.toISOString() : null,
    pinnedAt: member.pinnedAt ? member.pinnedAt.toISOString() : null,
    role: member.role,
    adminView: member.adminView,
    canWrite: member.canWrite,
    members: chat.members.map((x) => ({
      ...toPerson(x.user, { hasIdentity: true, lastSeenAt: seen.get(x.user.id) || null }),
      role: x.role,
      lastReadAt: x.lastReadAt ? x.lastReadAt.toISOString() : null,
      lastReadMessageId: x.lastReadMessageId,
    })),
  });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await ctx.params;
  const member = await requireMember(session.user, id);
  if (!member) return NextResponse.json({ error: "Нет чата" }, { status: 404 });
  const body = await req.json().catch(() => null);

  if (member.id && typeof body?.muted === "boolean") {
    if (member.chat.kind === "studio") {
      return NextResponse.json({ error: "Общий чат студии нельзя отключить" }, { status: 403 });
    }
    await prisma.chatMember.update({
      where: { id: member.id },
      data: { mutedUntil: body.muted ? new Date("2099-01-01") : null },
    });
  }
  if (member.id && typeof body?.pinned === "boolean") {
    await prisma.chatMember.update({
      where: { id: member.id },
      data: { pinnedAt: body.pinned ? new Date() : null },
    });
  }
  if (typeof body?.title === "string") {
    if (member.chat.kind !== "group" || !isAdminRole(member.role) || member.adminView) {
      return NextResponse.json({ error: "Название может сменить админ группы" }, { status: 403 });
    }
    const enc = await sealTitle(body.title.trim().slice(0, 120));
    await prisma.chat.update({ where: { id }, data: { titleCipher: enc.ciphertext, titleIv: enc.iv } });
  }
  return NextResponse.json({ ok: true });
}
