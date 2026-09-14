import { mkdir, readFile, rm, writeFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertInside, fileRoot, saveUpload } from "@/lib/files";
import { requireMeetAccess } from "@/lib/meet";
import { storeGlbPreview } from "@/lib/glb-convert";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await ctx.params;
  const meet = await requireMeetAccess(session.user, id);
  if (!meet) return NextResponse.json({ error: "Нет совещания" }, { status: 404 });
  if (meet.authorId !== session.user.id) return NextResponse.json({ error: "Файлы добавляет ведущий" }, { status: 403 });
  const settings = await prisma.appSettings.findUnique({ where: { id: "default" } });
  const maxBytes = Math.max(settings?.maxUploadMb || 32, 512) * 1024 * 1024;
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Нет файла" }, { status: 400 });
  const originalName = String(form.get("name") || file.name || "file.pdf").slice(0, 200);
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
      const dir = assertInside(fileRoot(), path.join(fileRoot(), "tmp-meet", uploadId));
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
    const saved = await saveUpload({
      buffer,
      originalName,
      declaredMime: file.type || "application/pdf",
      userId: session.user.id,
      maxBytes,
    });
    await prisma.meetingFile.create({ data: { meetingId: id, fileId: saved.id, previewFileId: "" } });
    void storeGlbPreview({
      buffer,
      originalName,
      userId: session.user.id,
      maxBytes,
    }).then((previewFileId) => {
      if (!previewFileId) return;
      return prisma.meetingFile.updateMany({ where: { meetingId: id, fileId: saved.id }, data: { previewFileId } });
    });
    return NextResponse.json({ id: saved.id, name: saved.originalName, mime: saved.mimeType, size: saved.size });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Ошибка" }, { status: 400 });
  }
}
