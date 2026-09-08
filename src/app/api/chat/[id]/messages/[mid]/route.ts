import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireMember, sealPayload } from "@/lib/chat-server";

const EDIT_MS = 15 * 60 * 1000;

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; mid: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id, mid } = await ctx.params;
  const member = await requireMember(session.user, id);
  if (!member) return NextResponse.json({ error: "Нет чата" }, { status: 404 });
  const msg = await prisma.chatMessage.findFirst({ where: { id: mid, chatId: id } });
  if (!msg) return NextResponse.json({ error: "Нет сообщения" }, { status: 404 });
  const body = await req.json().catch(() => null);

  if (body?.delete === true) {
    if (msg.authorId !== session.user.id && member.role !== "owner") {
      return NextResponse.json({ error: "Удалить у всех может автор" }, { status: 403 });
    }
    await prisma.chatMessage.update({
      where: { id: mid },
      data: { deletedAt: new Date(), ciphertext: "", iv: "" },
    });
    return NextResponse.json({ ok: true, deleted: true });
  }

  if (typeof body?.text === "string") {
    if (msg.authorId !== session.user.id) return NextResponse.json({ error: "Править может автор" }, { status: 403 });
    if (msg.deletedAt) return NextResponse.json({ error: "Уже удалено" }, { status: 400 });
    if (Date.now() - msg.createdAt.getTime() > EDIT_MS) {
      return NextResponse.json({ error: "Править можно 15 минут" }, { status: 400 });
    }
    const sealed = await sealPayload({ v: 1, t: "text", text: String(body.text).slice(0, 8000) });
    await prisma.chatMessage.update({
      where: { id: mid },
      data: { ciphertext: sealed.ciphertext, iv: sealed.iv, editedAt: new Date() },
    });
    return NextResponse.json({ ok: true, edited: true });
  }

  return NextResponse.json({ error: "Нечего менять" }, { status: 400 });
}
