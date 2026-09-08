import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireMember, saveEncryptedBlob } from "@/lib/chat-server";
import { rateLimit } from "@/lib/login-guard";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await ctx.params;
  const member = await requireMember(session.user, id);
  if (!member || !member.canWrite) return NextResponse.json({ error: "Нет чата" }, { status: 404 });
  if (!rateLimit(`chat-blob:${session.user.id}`, 40, 60 * 1000)) {
    return NextResponse.json({ error: "Слишком много файлов. Подождите минуту." }, { status: 429 });
  }
  const settings = await prisma.appSettings.findUnique({ where: { id: "default" } });
  const maxBytes = (settings?.maxUploadMb || 32) * 1024 * 1024;
  const form = await req.formData();
  const file = form.get("file") || form.get("blob");
  if (!(file instanceof File)) return NextResponse.json({ error: "Нет файла" }, { status: 400 });
  try {
    const saved = await saveEncryptedBlob({
      chatId: id,
      userId: session.user.id,
      buffer: Buffer.from(await file.arrayBuffer()),
      maxBytes,
      mime: file.type,
      originalName: file.name,
    });
    return NextResponse.json({
      id: saved.id,
      size: saved.size,
      mime: saved.mime,
      originalName: saved.originalName,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Ошибка" }, { status: 400 });
  }
}
