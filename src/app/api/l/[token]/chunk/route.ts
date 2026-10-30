import { createWriteStream } from "fs";
import { mkdir, rm, stat } from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { NextRequest, NextResponse } from "next/server";
import { assertInShare, findLibraryShare, saveLibraryItemFromDisk } from "@/lib/library";
import { assemblePartFiles, assertInside, fileRoot, pruneTmpUploads } from "@/lib/files";
import { rateLimit } from "@/lib/login-guard";
import { requestTrustedIp } from "@/lib/presence";

const LIBRARY_MAX_BYTES = 8 * 1024 * 1024 * 1024;
const MAX_CHUNKS = 2048;

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const ip = requestTrustedIp(req) || "share";
  if (!rateLimit(`libup:${ip}`, 600, 60_000)) {
    return NextResponse.json({ error: "Слишком часто" }, { status: 429 });
  }
  const { token } = await ctx.params;
  const root = await findLibraryShare(token);
  if (!root) return NextResponse.json({ error: "Ссылка не действует" }, { status: 404 });
  if (!root.shareCreate) return NextResponse.json({ error: "По этой ссылке нельзя добавлять файлы" }, { status: 403 });

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
  const dir = assertInside(fileRoot(), path.join(fileRoot(), "tmp-library", `share-${uploadId}`));
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
    const parentId = String(form.get("parentId") || root.id);
    await assertInShare(root.id, parentId);
    const assembled = await assemblePartFiles(dir, chunkTotal, LIBRARY_MAX_BYTES);
    const st = await stat(/* turbopackIgnore: true */ assembled.path);
    const row = await saveLibraryItemFromDisk({
      user: { id: root.authorId },
      title: String(form.get("title") || ""),
      kind: String(form.get("kind") || ""),
      description: String(form.get("description") || ""),
      parentId,
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
