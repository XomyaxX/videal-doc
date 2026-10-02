import { NextRequest, NextResponse } from "next/server";
import { collectZipEntries, findLibraryShare, libraryZipResponse, shareBrowse } from "@/lib/library";
import { rateLimit } from "@/lib/login-guard";

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const ip = req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for") || "share";
  if (!rateLimit(`libzip:${ip}`, 20, 60_000)) {
    return new NextResponse("Слишком часто", { status: 429 });
  }
  const { token } = await ctx.params;
  const root = await findLibraryShare(token);
  if (!root) return new NextResponse("Ссылка не действует", { status: 404 });
  if (root.shareDownload === false) return new NextResponse("Скачивание закрыто", { status: 403 });
  const p = (req.nextUrl.searchParams.get("p") || "").trim() || root.id;
  const browse = await shareBrowse(root.id, p);
  if (!browse) return new NextResponse("Нет", { status: 404 });
  try {
    const entries = await collectZipEntries([browse.current.id]);
    return await libraryZipResponse(browse.current.title, entries);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Не удалось собрать архив" }, { status: 400 });
  }
}
