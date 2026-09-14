import { mkdir, readFile, rm, writeFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireMember, saveEncryptedBlob } from "@/lib/chat-server";
import { rateLimit } from "@/lib/login-guard";
import { convertToGlb } from "@/lib/glb-convert";
import { assertInside, fileRoot } from "@/lib/files";

async function attachGlbPreview(opts: {
  chatId: string;
  userId: string;
  blobId: string;
  buffer: Buffer;
  originalName: string;
  maxBytes: number;
}) {
  try {
    const glb = await convertToGlb(opts.buffer, opts.originalName);
    if (!glb) return;
    const prev = await saveEncryptedBlob({
      chatId: opts.chatId,
      userId: opts.userId,
      buffer: glb,
      maxBytes: Math.max(opts.maxBytes, glb.length + 1024),
      mime: "model/gltf-binary",
      originalName: "preview.glb",
    });
    await prisma.chatBlob.update({ where: { id: opts.blobId }, data: { previewId: prev.id } });
  } catch (e) {
    console.error("chat-glb-preview", opts.originalName, e);
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await ctx.params;
  const member = await requireMember(session.user, id);
  if (!member || !member.canWrite) return NextResponse.json({ error: "Нет чата" }, { status: 404 });
  if (!rateLimit(`chat-blob:${session.user.id}`, 80, 60 * 1000)) {
    return NextResponse.json({ error: "Слишком много файлов. Подождите минуту." }, { status: 429 });
  }
  const settings = await prisma.appSettings.findUnique({ where: { id: "default" } });
  const maxBytes = Math.max(settings?.maxUploadMb || 32, 512) * 1024 * 1024;
  const form = await req.formData();
  const file = form.get("file") || form.get("blob");
  if (!(file instanceof File)) return NextResponse.json({ error: "Нет файла" }, { status: 400 });
  const originalName = String(form.get("name") || file.name || "file").slice(0, 200);
  const chunkTotal = Math.max(1, Number(form.get("chunkTotal") || 1) || 1);
  const chunkIndex = Number(form.get("chunkIndex") || 0);
  const uploadId = String(form.get("uploadId") || "").replace(/[^a-zA-Z0-9_-]/g, "");
  try {
    let buffer = Buffer.from(await file.arrayBuffer());
    if (chunkTotal > 1) {
      if (!uploadId) return NextResponse.json({ error: "Нет uploadId" }, { status: 400 });
      if (chunkIndex < 0 || chunkIndex >= chunkTotal || chunkTotal > 200) {
        return NextResponse.json({ error: "Неверный кусок" }, { status: 400 });
      }
      const dir = assertInside(fileRoot(), path.join(fileRoot(), "tmp-chat", uploadId));
      await mkdir(dir, { recursive: true });
      const part = assertInside(dir, path.join(dir, `${String(chunkIndex).padStart(5, "0")}.part`));
      await writeFile(/* turbopackIgnore: true */ part, buffer);
      if (chunkIndex < chunkTotal - 1) {
        return NextResponse.json({ ok: true, chunk: chunkIndex });
      }
      const parts: Buffer[] = [];
      let total = 0;
      for (let i = 0; i < chunkTotal; i++) {
        const p = assertInside(dir, path.join(dir, `${String(i).padStart(5, "0")}.part`));
        const buf = await readFile(/* turbopackIgnore: true */ p);
        total += buf.length;
        if (total > maxBytes) {
          await rm(/* turbopackIgnore: true */ dir, { recursive: true, force: true });
          return NextResponse.json({ error: "Файл слишком большой" }, { status: 400 });
        }
        parts.push(buf);
      }
      buffer = Buffer.concat(parts);
      await rm(/* turbopackIgnore: true */ dir, { recursive: true, force: true });
    }
    const saved = await saveEncryptedBlob({
      chatId: id,
      userId: session.user.id,
      buffer,
      maxBytes,
      mime: file.type,
      originalName,
    });
    await attachGlbPreview({
      chatId: id,
      userId: session.user.id,
      blobId: saved.id,
      buffer,
      originalName,
      maxBytes,
    });
    const fresh = await prisma.chatBlob.findUnique({ where: { id: saved.id }, select: { previewId: true } });
    return NextResponse.json({
      id: saved.id,
      size: saved.size,
      mime: saved.mime,
      originalName: saved.originalName,
      previewId: fresh?.previewId || "",
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Ошибка" }, { status: 400 });
  }
}
