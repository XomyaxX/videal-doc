import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readStoredFile } from "@/lib/files";
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
  if (!row) return new NextResponse("Нет", { status: 404 });

  if (row.previewFileId) {
    const preview = await readStoredFile(row.previewFileId);
    if (preview) {
      return new NextResponse(new Uint8Array(preview.buffer), {
        headers: {
          "Content-Type": preview.rec.mimeType,
          "Cache-Control": "private, max-age=86400",
        },
      });
    }
  }

  const cover =
    row.files.find((f) => previewMode(f) === "image") ||
    (previewMode(row) === "image" ? row : null);
  if (!cover) return new NextResponse("Нет превью", { status: 404 });
  const mode = previewMode(cover);
  if (mode !== "image") return new NextResponse("Нет превью", { status: 404 });
  const file = await readLibraryBytes(cover);
  if (!file) return new NextResponse("Нет", { status: 404 });
  const ext = path.extname(file.name).toLowerCase();
  if (ext === ".tif" || ext === ".tiff") return new NextResponse("Нет превью", { status: 404 });
  return new NextResponse(new Uint8Array(file.buffer), {
    headers: {
      "Content-Type": file.mime,
      "Cache-Control": "private, max-age=86400",
    },
  });
}
