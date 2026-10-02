import { createWriteStream } from "fs";
import { mkdir, rm, stat } from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canManageLibrary, saveLibraryItemFromDisk } from "@/lib/library";
import { assemblePartFiles, assertInside, fileRoot, pruneTmpUploads } from "@/lib/files";

const LIBRARY_MAX_BYTES = 8 * 1024 * 1024 * 1024;
const MAX_CHUNKS = 2048;

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !canManageLibrary(session.user)) {
    return NextResponse.json({ error: "Добавлять файлы может только руководство" }, { status: 403 });
  }
  const form = await req.formData();
  const uploadId = String(form.get("uploadId") || "").replace(/[^a-zA-Z0-9_-]/g, "");
  const chunkIndex = Number(form.get("chunkIndex"));
  const chunkTotal = Number(form.get("chunkTotal"));
  const fileName = String(form.get("fileName") || "file");
  const mime = String(form.get("mime") || "");
  const chunk = form.get("chunk");
  if (!uploadId || !(chunk instanceof File) || chunk.size === 0) {
    return NextResponse.json({ error: "Нет куска" }, { status: 400 });
  }
  if (
    !Number.isInteger(chunkIndex) ||
    !Number.isInteger(chunkTotal) ||
    chunkIndex < 0 ||
    chunkIndex >= chunkTotal ||
    chunkTotal > MAX_CHUNKS
  ) {
    return NextResponse.json(
      { error: chunkTotal > MAX_CHUNKS ? "Файл больше 8 ГБ" : "Неверный кусок" },
      { status: 400 },
    );
  }
  if (chunk.size > LIBRARY_MAX_BYTES) {
    return NextResponse.json({ error: "Файл больше 8 ГБ" }, { status: 400 });
  }
  void pruneTmpUploads("tmp-library");
  const dir = assertInside(fileRoot(), path.join(fileRoot(), "tmp-library", uploadId));
  await mkdir(dir, { recursive: true });
  const part = assertInside(dir, path.join(dir, `${String(chunkIndex).padStart(5, "0")}.part`));
  await pipeline(
    Readable.fromWeb(chunk.stream() as import("stream/web").ReadableStream),
    createWriteStream(/* turbopackIgnore: true */ part),
  );
  if (chunkIndex < chunkTotal - 1) {
    return NextResponse.json({ ok: true, chunk: chunkIndex });
  }
  try {
    const assembled = await assemblePartFiles(dir, chunkTotal, LIBRARY_MAX_BYTES);
    const st = await stat(/* turbopackIgnore: true */ assembled.path);
    const row = await saveLibraryItemFromDisk({
      user: session.user,
      title: String(form.get("title") || ""),
      kind: String(form.get("kind") || ""),
      description: String(form.get("description") || ""),
      parentId: String(form.get("parentId") || ""),
      originalName: fileName,
      mime,
      size: st.size,
      sourcePath: assembled.path,
      maxBytes: LIBRARY_MAX_BYTES,
    });
    return NextResponse.json({ id: row.id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Ошибка" }, { status: 400 });
  } finally {
    await rm(/* turbopackIgnore: true */ dir, { recursive: true, force: true });
  }
}
