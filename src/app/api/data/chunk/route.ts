import { mkdir, rm, writeFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { auditRemote, auditRequestIp } from "@/lib/audit";
import { assemblePartFiles, assertInside, fileRoot, pruneTmpUploads } from "@/lib/files";
import { restoreRelatedArchive } from "@/lib/blend-remap";
import { blockedName, canWorkData, normalizeRel, placeUpload, safeDataName } from "@/lib/share-data";

export const maxDuration = 600;

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !canWorkData(session.user)) {
    return NextResponse.json({ error: "Писать в Data нельзя" }, { status: 403 });
  }
  const form = await req.formData();
  const uploadId = String(form.get("uploadId") || "").replace(/[^a-zA-Z0-9_-]/g, "");
  const chunkIndex = Number(form.get("chunkIndex"));
  const chunkTotal = Number(form.get("chunkTotal"));
  let fileName = "";
  try {
    fileName = safeDataName(String(form.get("fileName") || "file"));
  } catch {
    return NextResponse.json({ error: "Пустое имя файла" }, { status: 400 });
  }
  const chunk = form.get("chunk");
  if (!uploadId || !(chunk instanceof File) || chunk.size === 0) {
    return NextResponse.json({ error: "Нет куска" }, { status: 400 });
  }
  if (!Number.isFinite(chunkIndex) || chunkIndex < 0 || chunkIndex >= chunkTotal || chunkTotal > 800) {
    return NextResponse.json({ error: "Неверный кусок" }, { status: 400 });
  }
  if (blockedName(fileName)) {
    return NextResponse.json({ error: "Этот тип нельзя загрузить" }, { status: 400 });
  }
  void pruneTmpUploads("tmp-data");
  const dir = assertInside(fileRoot(), path.join(fileRoot(), "tmp-data", uploadId));
  await mkdir(dir, { recursive: true });
  const part = assertInside(dir, path.join(dir, `${String(chunkIndex).padStart(5, "0")}.part`));
  await writeFile(/* turbopackIgnore: true */ part, Buffer.from(await chunk.arrayBuffer()));
  if (chunkIndex < chunkTotal - 1) {
    return NextResponse.json({ ok: true, chunk: chunkIndex });
  }
  const relatedRestore = String(form.get("relatedRestore") || "") === "1";
  const settings = await prisma.appSettings.findUnique({ where: { id: "default" } });
  const maxBytes = relatedRestore
    ? 2 * 1024 * 1024 * 1024
    : Math.max(settings?.maxUploadMb || 32, 1024) * 1024 * 1024;
  const destDir = String(form.get("dir") || "");
  try {
    const assembled = await assemblePartFiles(dir, chunkTotal, maxBytes);
    if (relatedRestore) {
      let rootRel = "";
      try {
        rootRel = normalizeRel(String(form.get("rootRel") || ""));
      } catch {
        return NextResponse.json({ error: "Некорректный путь" }, { status: 400 });
      }
      if (!rootRel) return NextResponse.json({ error: "Нет файла" }, { status: 400 });
      const replaceGlobal = String(form.get("replaceGlobal") || "") === "1";
      const result = await restoreRelatedArchive({ zipAbs: assembled.path, rootRel, replaceGlobal });
      await auditRemote({
        user: session.user,
        action: "data.related.restore",
        entity: "data",
        entityId: rootRel.slice(0, 200),
        details: `${rootRel} files=${result.written.length} global=${replaceGlobal ? 1 : 0}`,
        ip: auditRequestIp(req),
        throttle: false,
      });
      return NextResponse.json(result);
    }
    const rel = await placeUpload(destDir, fileName, assembled.path);
    await auditRemote({
      user: session.user,
      action: "data.file.put",
      entity: "data",
      entityId: rel.slice(0, 200),
      details: rel,
      ip: auditRequestIp(req),
      throttle: false,
    });
    return NextResponse.json({ ok: true, rel });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Ошибка" }, { status: 400 });
  } finally {
    await rm(/* turbopackIgnore: true */ dir, { recursive: true, force: true });
  }
}
