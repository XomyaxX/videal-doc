import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertChatWriter, serializePoll } from "@/lib/chat-widgets";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; pollId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id, pollId } = await ctx.params;
  try {
    await assertChatWriter(session.user, id);
  } catch {
    return NextResponse.json({ error: "Нет чата" }, { status: 404 });
  }
  const poll = await prisma.chatPoll.findFirst({
    where: { id: pollId, chatId: id },
    include: { options: { include: { votes: { select: { userId: true } } } } },
  });
  if (!poll) return NextResponse.json({ error: "Нет голосования" }, { status: 404 });
  const body = await req.json().catch(() => ({}));

  if (body?.close) {
    if (poll.authorId !== session.user.id) {
      return NextResponse.json({ error: "Закрыть может только автор" }, { status: 403 });
    }
    const next = await prisma.chatPoll.update({
      where: { id: poll.id },
      data: { closedAt: poll.closedAt || new Date() },
      include: { options: { include: { votes: { select: { userId: true } } } } },
    });
    return NextResponse.json({ poll: serializePoll(next, session.user.id) });
  }

  if (poll.closedAt) return NextResponse.json({ error: "Голосование закрыто" }, { status: 400 });
  const optionId = String(body?.optionId || "");
  const option = poll.options.find((o) => o.id === optionId);
  if (!option) return NextResponse.json({ error: "Нет такого варианта" }, { status: 400 });

  const mine = option.votes.some((v) => v.userId === session.user.id);
  if (mine) {
    await prisma.chatPollVote.deleteMany({ where: { optionId, userId: session.user.id } });
  } else {
    if (!poll.multi) {
      await prisma.chatPollVote.deleteMany({ where: { pollId: poll.id, userId: session.user.id } });
    }
    await prisma.chatPollVote.create({ data: { pollId: poll.id, optionId, userId: session.user.id } });
  }
  const next = await prisma.chatPoll.findUniqueOrThrow({
    where: { id: poll.id },
    include: { options: { include: { votes: { select: { userId: true } } } } },
  });
  return NextResponse.json({ poll: serializePoll(next, session.user.id) });
}
