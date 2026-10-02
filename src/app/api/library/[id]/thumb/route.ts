import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readStoredFile } from "@/lib/files";
import { serveMediaThumb } from "@/lib/file-thumb";
import { canViewLibrary, libraryAbs, libraryItemVisible, previewMode } from "@/lib/library";

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
  if (!(await libraryItemVisible(session.user, id))) return new NextResponse("Нет", { status: 404 });

  if (row.previewFileId) {
    const preview = await readStoredFile(row.previewFileId);
    if (preview && preview.rec.mimeType.startsWith("image/")) {
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
    row.files.find((f) => previewMode(f) === "video") ||
    row.files.find((f) => previewMode(f) === "pdf") ||
    (previewMode(row) === "image" || previewMode(row) === "video" || previewMode(row) === "pdf" ? row : null);
  if (!cover) return new NextResponse("Нет превью", { status: 404 });
  const loc = await libraryAbs(cover);
  if (!loc) return new NextResponse("Нет", { status: 404 });
  const res = await serveMediaThumb(loc.abs, loc.name, loc.mime);
  if (!res) return new NextResponse("Нет превью", { status: 404 });
  return res;
}
