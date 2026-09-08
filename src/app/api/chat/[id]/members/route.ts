import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { canHoldChatKey, isAdminRole, requireMember } from "@/lib/chat-server";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await ctx.params;
  const member = await requireMember(session.user, id);
  if (!member) return NextResponse.json({ error: "Нет чата" }, { status: 404 });
  const official = member.chat.kind === "studio" || member.chat.kind === "dept";
  const body = await req.json().catch(() => null);

  if (body?.leave === true) {
    if (member.adminView || official) {
      return NextResponse.json({ error: official ? "Из общего чата отдела или студии нельзя выйти" : "Нет чата" }, { status: 403 });
    }
    const others = await prisma.chatMember.count({ where: { chatId: id, leftAt: null, userId: { not: session.user.id } } });
    if (member.role === "owner" && others > 0) {
      const nextAdmin = await prisma.chatMember.findFirst({
        where: { chatId: id, leftAt: null, userId: { not: session.user.id } },
        orderBy: { joinedAt: "asc" },
      });
      if (nextAdmin) {
        await prisma.chatMember.update({ where: { id: nextAdmin.id }, data: { role: "owner" } });
      }
    }
    await prisma.chatMember.update({ where: { id: member.id }, data: { leftAt: new Date(), unreadCount: 0 } });
    await audit({ userId: session.user.id, action: "chat.leave", entity: "chat", entityId: id });
    return NextResponse.json({ ok: true, left: true });
  }

  const canEditMembers =
    (!member.adminView && isAdminRole(member.role) && member.chat.kind === "group") ||
    (member.adminView && canHoldChatKey(session.user) && member.chat.kind === "group");
  if (!canEditMembers) {
    return NextResponse.json(
      { error: official ? "Состав общего чата ставится по отделам сам" : "Добавлять и убирать может админ" },
      { status: 403 },
    );
  }

  const addIds: string[] = Array.isArray(body?.add) ? body.add.map(String) : [];
  const removeId = String(body?.remove || "");
  const promoteId = String(body?.promote || "");

  if (promoteId) {
    const row = await prisma.chatMember.findFirst({ where: { chatId: id, userId: promoteId, leftAt: null } });
    if (!row) return NextResponse.json({ error: "Нет участника" }, { status: 404 });
    if (member.role !== "owner") return NextResponse.json({ error: "Админа ставит владелец" }, { status: 403 });
    await prisma.chatMember.update({ where: { id: row.id }, data: { role: row.role === "admin" ? "member" : "admin" } });
    return NextResponse.json({ ok: true });
  }

  if (removeId) {
    if (removeId === session.user.id) return NextResponse.json({ error: "Выйдите кнопкой «выйти»" }, { status: 400 });
    const row = await prisma.chatMember.findFirst({ where: { chatId: id, userId: removeId, leftAt: null } });
    if (!row) return NextResponse.json({ error: "Нет участника" }, { status: 404 });
    if (row.role === "owner") return NextResponse.json({ error: "Владельца нельзя убрать" }, { status: 403 });
    if (row.role === "admin" && member.role !== "owner") {
      return NextResponse.json({ error: "Админа убирает владелец" }, { status: 403 });
    }
    await prisma.chatMember.update({ where: { id: row.id }, data: { leftAt: new Date(), unreadCount: 0 } });
    await audit({ userId: session.user.id, action: "chat.kick", entity: "chat", entityId: id, details: removeId });
    return NextResponse.json({ ok: true });
  }

  if (addIds.length) {
    const unique = [...new Set(addIds)].filter((x) => x !== session.user.id);
    const people = await prisma.user.findMany({
      where: { id: { in: unique }, deletedAt: null, status: "active" },
      select: { id: true },
    });
    if (people.length !== unique.length) return NextResponse.json({ error: "Кого-то нет" }, { status: 400 });
    for (const uid of unique) {
      const prev = await prisma.chatMember.findUnique({ where: { chatId_userId: { chatId: id, userId: uid } } });
      if (prev) {
        await prisma.chatMember.update({ where: { id: prev.id }, data: { leftAt: null, role: "member", unreadCount: 0 } });
      } else {
        await prisma.chatMember.create({ data: { chatId: id, userId: uid, role: "member" } });
      }
    }
    await audit({ userId: session.user.id, action: "chat.add", entity: "chat", entityId: id, details: unique.join(",") });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Нечего менять" }, { status: 400 });
}
