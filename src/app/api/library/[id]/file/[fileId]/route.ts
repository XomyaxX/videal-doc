import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { canManageLibrary, canViewLibrary, previewMode, readLibraryBytes, removeLibraryFile } from "@/lib/library";

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
  const row =
    item.files.find((f) => f.id === fileId) ||
    (fileId === item.id || fileId === "cover"
      ? item.files[0] || item
      : null);
  if (!row) return new NextResponse("Нет файла", { status: 404 });
  const file = await readLibraryBytes(row);
  if (!file) return new NextResponse("Файл не найден на диске", { status: 404 });
  const mode = previewMode(row);
  const inline = mode !== "none";
  return new NextResponse(new Uint8Array(file.buffer), {
    headers: {
      "Content-Type": file.mime || "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "Cache-Control": "private, max-age=3600",
    },
  });
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
