import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertChatWriter, notifyChatMembers, postChatCard, serializeAsk } from "@/lib/chat-widgets";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await ctx.params;
  try {
    await assertChatWriter(session.user, id);
  } catch {
    return NextResponse.json({ error: "Нет чата" }, { status: 404 });
  }
  const body = await req.json().catch(() => null);
  const title = String(body?.title || "").trim().slice(0, 200);
  if (!title) return NextResponse.json({ error: "Напишите, что нужно прислать" }, { status: 400 });
  const members = await prisma.chatMember.findMany({
    where: { chatId: id, leftAt: null },
    select: { userId: true },
  });
  const live = new Set(members.map((m) => m.userId));
  const rawIds = Array.isArray(body?.userIds) ? (body.userIds as unknown[]).map((u) => String(u)) : [...live];
  const targets = [...new Set(rawIds.filter((u) => live.has(u) && u !== session.user.id))];
  if (!targets.length) {
    return NextResponse.json({ error: "Выберите, у кого собрать ответ" }, { status: 400 });
  }
  const msg = await postChatCard({
    chatId: id,
    userId: session.user.id,
    type: "ask",
    text: title,
  });
  const ask = await prisma.chatAsk.create({
    data: {
      chatId: id,
      messageId: msg.id,
      authorId: session.user.id,
      title,
      body: String(body?.body || "").trim().slice(0, 2000),
      targets: { create: targets.map((userId: string) => ({ userId })) },
    },
    include: {
      targets: {
        include: { user: { select: { lastName: true, firstName: true, middleName: true, photoFileId: true } } },
      },
      replies: { include: { user: { select: { lastName: true, firstName: true, middleName: true } } } },
    },
  });
  await notifyChatMembers({
    chatId: id,
    exceptUserId: session.user.id,
    onlyUserIds: targets,
    title: "Нужен ответ в чате",
    body: title,
  });
  return NextResponse.json({ id: ask.id, messageId: msg.id, ask: await serializeAsk(ask) });
}
