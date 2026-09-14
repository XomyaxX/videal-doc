import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertChatWriter, serializeAsk } from "@/lib/chat-widgets";
import { notify } from "@/lib/notify";
import { fullName } from "@/lib/names";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; askId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id, askId } = await ctx.params;
  try {
    await assertChatWriter(session.user, id);
  } catch {
    return NextResponse.json({ error: "Нет чата" }, { status: 404 });
  }
  const ask = await prisma.chatAsk.findFirst({
    where: { id: askId, chatId: id },
    include: { targets: true },
  });
  if (!ask) return NextResponse.json({ error: "Нет сбора" }, { status: 404 });
  if (!ask.targets.some((t) => t.userId === session.user.id)) {
    return NextResponse.json({ error: "Вас не просили отвечать" }, { status: 403 });
  }
  const already = await prisma.chatAskReply.findUnique({
    where: { askId_userId: { askId, userId: session.user.id } },
  });
  if (already) return NextResponse.json({ error: "Вы уже ответили" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const empty = Boolean(body?.empty);
  const blobIds = Array.isArray(body?.blobIds) ? body.blobIds.map(String).filter(Boolean).slice(0, 10) : [];
  if (!empty && !blobIds.length && !String(body?.text || "").trim()) {
    return NextResponse.json({ error: "Прикрепите файл, напишите ответ или отметьте «отправить пустым»" }, { status: 400 });
  }
  if (blobIds.length) {
    const blobs = await prisma.chatBlob.findMany({
      where: { id: { in: blobIds }, chatId: id, createdById: session.user.id },
      select: { id: true },
    });
    if (blobs.length !== blobIds.length) {
      return NextResponse.json({ error: "Файл не из этого чата" }, { status: 400 });
    }
    await prisma.chatBlob.updateMany({
      where: { id: { in: blobIds }, messageId: null },
      data: { messageId: ask.messageId },
    });
  }
  await prisma.chatAskReply.create({
    data: {
      askId,
      userId: session.user.id,
      empty,
      text: String(body?.text || "").trim().slice(0, 2000),
      blobJson: JSON.stringify(empty ? [] : blobIds),
    },
  });
  const next = await prisma.chatAsk.findUniqueOrThrow({
    where: { id: askId },
    include: {
      targets: {
        include: { user: { select: { lastName: true, firstName: true, middleName: true, photoFileId: true } } },
      },
      replies: { include: { user: { select: { lastName: true, firstName: true, middleName: true } } } },
    },
  });
  await notify({
    userId: ask.authorId,
    title: "Ответ на сбор",
    body: `${fullName(session.user)} · ${ask.title}`,
    link: `/chat/${id}`,
    urgency: "normal",
  });
  return NextResponse.json({ ask: await serializeAsk(next) });
}
