import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit, auditRemote, auditRequestIp } from "@/lib/audit";
import { serveMediaThumb } from "@/lib/file-thumb";
import {
  canManageLibrary,
  canViewLibrary,
  libraryAbs,
  libraryItemVisible,
  previewMode,
  removeLibraryFile,
  serveLibraryFile,
} from "@/lib/library";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string; fileId: string }> }) {
  const session = await getSession();
  if (!session || !canViewLibrary(session.user)) {
    return new NextResponse("Нет права", { status: 403 });
  }
  const { id, fileId } = await ctx.params;
  const item = await prisma.libraryItem.findFirst({
    where: { id, deletedAt: null },
    include: { files: { orderBy: { sortOrder: "asc" } } },
  });
  if (!item) return new NextResponse("Нет файла", { status: 404 });
  if (!(await libraryItemVisible(session.user, id))) return new NextResponse("Нет файла", { status: 404 });
  const row =
    item.files.find((f) => f.id === fileId) ||
    (fileId === item.id || fileId === "cover"
      ? item.files[0] || item
      : null);
  if (!row) return new NextResponse("Нет файла", { status: 404 });
  const asPreview = _req.nextUrl.searchParams.get("preview") === "1";
  if (asPreview && "previewFileId" in row && row.previewFileId) {
    const { readStoredFile } = await import("@/lib/files");
    const glb = await readStoredFile(String(row.previewFileId));
    if (glb) {
      return new NextResponse(new Uint8Array(glb.buffer), {
        headers: {
          "Content-Type": "model/gltf-binary",
          "Content-Disposition": `inline; filename="preview.glb"`,
          "Cache-Control": "private, max-age=3600",
        },
      });
    }
  }
  const mode = previewMode(row);
  const inline = mode !== "none" || asPreview;
  const poster = _req.nextUrl.searchParams.get("poster") === "1";
  if (poster) {
    const loc = await libraryAbs(row);
    if (!loc) return new NextResponse("Нет", { status: 404 });
    const thumb = await serveMediaThumb(loc.abs, loc.name, loc.mime);
    if (!thumb) return new NextResponse("Нет превью", { status: 404 });
    return thumb;
  }
  const res = await serveLibraryFile(row, _req, { inline });
  if (!res) return new NextResponse("Файл не найден на диске", { status: 404 });
  if (!poster) {
    const name = "originalName" in row && row.originalName ? String(row.originalName) : item.title;
    await auditRemote({
      user: session.user,
      action: asPreview || inline ? "library.file.view" : "library.file.download",
      entity: "library",
      entityId: id,
      details: name,
      ip: auditRequestIp(_req),
    });
  }
  return res;
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string; fileId: string }> }) {
  const session = await getSession();
  if (!session || !canManageLibrary(session.user)) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const { id, fileId } = await ctx.params;
  try {
    const result = await removeLibraryFile(id, fileId);
    await audit({
      userId: session.user.id,
      action: result.hidden ? "library.hide" : "library.file.remove",
      entity: "library",
      entityId: id,
      details: result.name,
    });
    return NextResponse.json({ ok: true, hidden: result.hidden });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Не удалось убрать файл";
    const status = msg === "Нет блока" || msg === "Нет файла" ? 404 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
