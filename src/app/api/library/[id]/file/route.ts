import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canViewLibrary, previewMode, readLibraryBytes } from "@/lib/library";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !canViewLibrary(session.user)) {
    return new NextResponse("Нет права", { status: 403 });
  }
  const { id } = await ctx.params;
  const row = await prisma.libraryItem.findFirst({
    where: { id, deletedAt: null },
    include: { files: { orderBy: { sortOrder: "asc" } } },
  });
  if (!row) return new NextResponse("Нет файла", { status: 404 });
  const target = row.files[0] || row;
  const file = await readLibraryBytes(target);
  if (!file) return new NextResponse("Файл не найден на диске", { status: 404 });
  const mode = previewMode(target);
  const inline = mode !== "none";
  return new NextResponse(new Uint8Array(file.buffer), {
    headers: {
      "Content-Type": file.mime || "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
