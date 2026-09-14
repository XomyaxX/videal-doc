import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertChatWriter, notifyChatMembers, postChatCard, serializePoll } from "@/lib/chat-widgets";

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
  const question = String(body?.question || "").trim().slice(0, 300);
  const options: string[] = Array.isArray(body?.options)
    ? body.options.map((o: unknown) => String(o || "").trim().slice(0, 120)).filter(Boolean)
    : [];
  const uniq: string[] = [...new Set(options)].slice(0, 10);
  if (!question) return NextResponse.json({ error: "Напишите вопрос" }, { status: 400 });
  if (uniq.length < 2) return NextResponse.json({ error: "Нужно хотя бы два варианта" }, { status: 400 });
  const msg = await postChatCard({
    chatId: id,
    userId: session.user.id,
    type: "poll",
    text: question,
  });
  const poll = await prisma.chatPoll.create({
    data: {
      chatId: id,
      messageId: msg.id,
      authorId: session.user.id,
      question,
      multi: Boolean(body?.multi),
      options: { create: uniq.map((text, i) => ({ text, sortOrder: i })) },
    },
    include: { options: { include: { votes: { select: { userId: true } } } } },
  });
  await notifyChatMembers({
    chatId: id,
    exceptUserId: session.user.id,
    title: "Голосование в чате",
    body: question,
  });
  return NextResponse.json({ id: poll.id, messageId: msg.id, poll: serializePoll(poll, session.user.id) });
}
