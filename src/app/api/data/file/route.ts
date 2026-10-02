import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { auditRemote, auditRequestIp } from "@/lib/audit";
import { serveMediaThumb } from "@/lib/file-thumb";
import { canViewData, mimeOf, normalizeRel, resolveData, serveDataFile } from "@/lib/share-data";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !canViewData(session.user)) {
    return new NextResponse("Нет права", { status: 403 });
  }
  let rel = "";
  try {
    rel = normalizeRel(req.nextUrl.searchParams.get("p") || "");
  } catch {
    return new NextResponse("Некорректный путь", { status: 400 });
  }
  const dl = req.nextUrl.searchParams.get("dl") === "1";
  const poster = req.nextUrl.searchParams.get("poster") === "1";
  if (poster) {
    try {
      const { abs } = await resolveData(rel, { exist: true });
      const name = rel.split("/").pop() || rel;
      const res = await serveMediaThumb(abs, name, mimeOf(name));
      if (!res) return new NextResponse("Нет превью", { status: 404 });
      return res;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Нет файла";
      const status = msg === "Некорректный путь" ? 400 : 404;
      return new NextResponse(msg, { status });
    }
  }
  try {
    const res = await serveDataFile(rel, req, { inline: !dl });
    if (!res) return new NextResponse("Это папка", { status: 400 });
    await auditRemote({
      user: session.user,
      action: dl ? "data.file.download" : "data.file.view",
      entity: "data",
      entityId: rel.slice(0, 200),
      details: rel,
      ip: auditRequestIp(req),
    });
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Нет файла";
    const status = msg === "Некорректный путь" ? 400 : 404;
    return new NextResponse(msg, { status });
  }
}
