import { NextRequest, NextResponse } from "next/server";
import { collectShareFiles, findLibraryShare, libraryAbs, previewMode, serveLibraryFile } from "@/lib/library";
import { serveMediaThumb } from "@/lib/file-thumb";
import { rateLimit } from "@/lib/login-guard";
import { requestTrustedIp } from "@/lib/presence";

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string; fileId: string }> }) {
  const ip = requestTrustedIp(req) || "share";
  if (!rateLimit(`libshare:${ip}`, 120, 60_000)) {
    return new NextResponse("Слишком часто", { status: 429 });
  }
  const { token, fileId } = await ctx.params;
  const item = await findLibraryShare(token);
  if (!item) return new NextResponse("Ссылка не действует", { status: 404 });
  const packed = await collectShareFiles(item.id);
  const hit = packed.find((p) => p.file.id === fileId);
  if (!hit) return new NextResponse("Нет файла", { status: 404 });
  const mode = previewMode(hit.file);
  if (req.nextUrl.searchParams.get("poster") === "1") {
    const loc = await libraryAbs(hit.file);
    if (!loc) return new NextResponse("Нет", { status: 404 });
    const poster = await serveMediaThumb(loc.abs, loc.name, loc.mime);
    if (!poster) return new NextResponse("Нет превью", { status: 404 });
    return poster;
  }
  const asDownload = req.nextUrl.searchParams.get("dl") === "1";
  if (item.shareDownload === false) {
    return new NextResponse("Скачивание закрыто", { status: 403 });
  }
  const inline = !asDownload && mode !== "none";
  const res = await serveLibraryFile(hit.file, req, { inline });
  if (!res) return new NextResponse("Файл не найден на диске", { status: 404 });
  return res;
}
