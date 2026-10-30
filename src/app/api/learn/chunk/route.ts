import { createWriteStream } from "fs";
import { mkdir, rm, stat } from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { assemblePartFiles, assertInside, fileRoot, pruneTmpUploads } from "@/lib/files";
import {
  addTrainingFileFromDisk,
  createTrainingItemFromDisk,
  serializeTraining,
  TRAINING_MAX_BYTES,
  TRAINING_MAX_CHUNKS,
} from "@/lib/training";
import { audit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
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
    chunkTotal > TRAINING_MAX_CHUNKS
  ) {
    return NextResponse.json(
      { error: chunkTotal > TRAINING_MAX_CHUNKS ? "Файл больше 8 ГБ" : "Неверный кусок" },
      { status: 400 },
    );
  }
  if (chunk.size > TRAINING_MAX_BYTES) {
    return NextResponse.json({ error: "Файл больше 8 ГБ" }, { status: 400 });
  }
  void pruneTmpUploads("tmp-training");
  const dir = assertInside(fileRoot(), path.join(fileRoot(), "tmp-training", uploadId));
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
    const assembled = await assemblePartFiles(dir, chunkTotal, TRAINING_MAX_BYTES);
    const st = await stat(/* turbopackIgnore: true */ assembled.path);
    const itemId = String(form.get("itemId") || "");
    const row = itemId
      ? await addTrainingFileFromDisk({
          itemId,
          userId: session.user.id,
          originalName: fileName,
          mime,
          size: st.size,
          sourcePath: assembled.path,
        })
      : await createTrainingItemFromDisk({
          userId: session.user.id,
          title: String(form.get("title") || ""),
          description: String(form.get("description") || ""),
          parentId: String(form.get("parentId") || "") || undefined,
          originalName: fileName,
          mime,
          size: st.size,
          sourcePath: assembled.path,
        });
    await audit({
      userId: session.user.id,
      action: itemId ? "training.file.add" : "training.create",
      entity: "training",
      entityId: row.id,
      details: fileName,
    });
    return NextResponse.json({ id: row.id, item: serializeTraining(row) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Ошибка" }, { status: 400 });
  } finally {
    await rm(/* turbopackIgnore: true */ dir, { recursive: true, force: true });
  }
}
