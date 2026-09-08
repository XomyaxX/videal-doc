import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { saveUpload } from "@/lib/files";
import { isAdminRole, requireMember } from "@/lib/chat-server";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await ctx.params;
  const member = await requireMember(session.user, id);
  if (!member) return NextResponse.json({ error: "Нет чата" }, { status: 404 });
  if (member.chat.kind !== "group" || !isAdminRole(member.role)) {
    return NextResponse.json({ error: "Фото группы ставит админ" }, { status: 403 });
  }
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Нет файла" }, { status: 400 });
  try {
    const saved = await saveUpload({
      buffer: Buffer.from(await file.arrayBuffer()),
      originalName: file.name || "group.jpg",
      declaredMime: file.type || "image/jpeg",
      userId: session.user.id,
      maxBytes: 2 * 1024 * 1024,
    });
    await prisma.chat.update({ where: { id }, data: { avatarFileId: saved.id } });
    return NextResponse.json({ id: saved.id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Ошибка" }, { status: 400 });
  }
}
