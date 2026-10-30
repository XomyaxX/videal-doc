import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serveMediaThumb } from "@/lib/file-thumb";
import { previewMode } from "@/lib/library-kinds";
import { trainingFileAbs } from "@/lib/training";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new NextResponse("Нужно войти", { status: 401 });
  const { id } = await ctx.params;
  const fileId = req.nextUrl.searchParams.get("file") || "";
  const item = await prisma.trainingItem.findFirst({
    where: { id, deletedAt: null },
    include: { files: { where: { deletedAt: null }, orderBy: { sortOrder: "asc" } } },
  });
  if (!item) return new NextResponse("Нет", { status: 404 });
  const cover =
    (fileId ? item.files.find((f) => f.id === fileId) : null) ||
    item.files.find((f) => previewMode(f) === "image") ||
    item.files.find((f) => previewMode(f) === "video") ||
    item.files.find((f) => previewMode(f) === "pdf") ||
    item.files[0];
  if (!cover) return new NextResponse("Нет превью", { status: 404 });
  let abs = "";
  try {
    abs = trainingFileAbs(cover.relPath);
  } catch {
    return new NextResponse("Нет", { status: 404 });
  }
  const res = await serveMediaThumb(abs, cover.originalName, cover.mimeType);
  if (!res) return new NextResponse("Нет превью", { status: 404 });
  return res;
}
