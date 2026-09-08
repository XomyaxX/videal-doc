import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { bumpUnread, notifyChatMentions, openPayload, requireMember, sealPayload, touchChatSeen } from "@/lib/chat-server";
import { fullName } from "@/lib/names";
import type { ChatPayload } from "@/lib/chat-types";
import { rateLimit } from "@/lib/login-guard";

const PAGE = 50;

function serialize(m: {
  id: string;
  authorId: string;
  type: string;
  replyToId: string;
  createdAt: Date;
  editedAt: Date | null;
  deletedAt: Date | null;
  author: { lastName: string; firstName: string; middleName: string; photoFileId: string };
  blobs: { id: string; size: number; mime: string; originalName: string }[];
  reactions: { userId: string; emoji: string }[];
}, payload: ChatPayload | null) {
  return {
    id: m.id,
    authorId: m.authorId,
    authorName: fullName(m.author),
    lastName: m.author.lastName,
    firstName: m.author.firstName,
    photoFileId: m.author.photoFileId,
    type: m.type,
    replyToId: m.replyToId,
    createdAt: m.createdAt.toISOString(),
    editedAt: m.editedAt ? m.editedAt.toISOString() : null,
    deletedAt: m.deletedAt ? m.deletedAt.toISOString() : null,
    payload: m.deletedAt ? null : payload,
    blobs: m.deletedAt ? [] : m.blobs,
    reactions: m.reactions,
  };
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await ctx.params;
  const member = await requireMember(session.user, id);
  if (!member) return NextResponse.json({ error: "Нет чата" }, { status: 404 });
  void touchChatSeen(session.user.id);
  const before = req.nextUrl.searchParams.get("before") || "";
  const after = req.nextUrl.searchParams.get("after") || "";
  const where: { chatId: string; createdAt?: { lt?: Date; gt?: Date } } = { chatId: id };
  if (before) {
    const row = await prisma.chatMessage.findUnique({ where: { id: before }, select: { createdAt: true } });
    if (row) where.createdAt = { lt: row.createdAt };
  }
  if (after) {
    const row = await prisma.chatMessage.findUnique({ where: { id: after }, select: { createdAt: true } });
    if (row) where.createdAt = { gt: row.createdAt };
  }
  const rows = await prisma.chatMessage.findMany({
    where,
    orderBy: { createdAt: after ? "asc" : "desc" },
    take: PAGE,
    include: {
      author: { select: { id: true, lastName: true, firstName: true, middleName: true, photoFileId: true } },
      blobs: { select: { id: true, size: true, mime: true, originalName: true } },
      reactions: { select: { userId: true, emoji: true } },
    },
  });
  const ordered = after ? rows : [...rows].reverse();
  const messages = [];
  for (const m of ordered) {
    const payload = m.deletedAt ? null : await openPayload(m.iv, m.ciphertext);
    messages.push(serialize(m, payload));
  }
  return NextResponse.json({ messages });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await ctx.params;
  const member = await requireMember(session.user, id);
  if (!member || !member.canWrite) return NextResponse.json({ error: "Нет чата" }, { status: 404 });
  if (!rateLimit(`chat-msg:${session.user.id}`, 60, 60 * 1000)) {
    return NextResponse.json({ error: "Слишком часто. Подождите минуту." }, { status: 429 });
  }
  const body = await req.json().catch(() => null);
  const type = String(body?.type || "text");
  const text = String(body?.text || "").slice(0, 8000);
  const replyToId = String(body?.replyToId || "").slice(0, 40);
  const blobIds = Array.isArray(body?.blobIds) ? body.blobIds.map(String) : [];
  if (!["text", "file", "voice", "system"].includes(type)) {
    return NextResponse.json({ error: "Неизвестный тип" }, { status: 400 });
  }
  const payload: ChatPayload = { v: 1, t: type as ChatPayload["t"] };
  if (text) payload.text = text;
  if (replyToId) payload.replyTo = replyToId;
  if (Array.isArray(body?.files)) payload.files = body.files;
  if (body?.voice) payload.voice = body.voice;
  if (body?.system) payload.system = body.system;
  if (type === "text" && !text.trim()) return NextResponse.json({ error: "Пустое сообщение" }, { status: 400 });
  const sealed = await sealPayload(payload);
  const msg = await prisma.chatMessage.create({
    data: {
      chatId: id,
      authorId: session.user.id,
      type,
      ciphertext: sealed.ciphertext,
      iv: sealed.iv,
      replyToId,
      size: sealed.ciphertext.length,
    },
    include: {
      author: { select: { id: true, lastName: true, firstName: true, middleName: true, photoFileId: true } },
      blobs: { select: { id: true, size: true, mime: true, originalName: true } },
      reactions: { select: { userId: true, emoji: true } },
    },
  });
  if (blobIds.length) {
    await prisma.chatBlob.updateMany({
      where: { id: { in: blobIds }, chatId: id, createdById: session.user.id, messageId: null },
      data: { messageId: msg.id },
    });
  }
  await prisma.chat.update({ where: { id }, data: { lastMessageAt: msg.createdAt } });
  await bumpUnread(id, session.user.id);
  if (type !== "system") {
    const mentionIds = Array.isArray(body?.mentionIds) ? body.mentionIds.map(String) : [];
    void notifyChatMentions({ chatId: id, authorId: session.user.id, text, mentionIds });
  }
  const blobs = await prisma.chatBlob.findMany({
    where: { messageId: msg.id },
    select: { id: true, size: true, mime: true, originalName: true },
  });
  return NextResponse.json(serialize({ ...msg, blobs }, payload));
}
