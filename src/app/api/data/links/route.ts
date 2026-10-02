import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { auditRemote, auditRequestIp } from "@/lib/audit";
import { loadBlendLinks } from "@/lib/blend-links";
import { canViewData, canWorkData, normalizeRel } from "@/lib/share-data";

export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !canViewData(session.user)) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  let rel = "";
  try {
    rel = normalizeRel(req.nextUrl.searchParams.get("p") || "");
  } catch {
    return NextResponse.json({ error: "Некорректный путь" }, { status: 400 });
  }
  if (!rel) return NextResponse.json({ error: "Нет файла" }, { status: 400 });
  const refresh = req.nextUrl.searchParams.get("refresh") === "1";
  try {
    const info = await loadBlendLinks(rel, { refresh, writeSidecar: canWorkData(session.user) });
    await auditRemote({
      user: session.user,
      action: "data.links.view",
      entity: "data",
      entityId: rel.slice(0, 200),
      details: rel,
      ip: auditRequestIp(req),
    });
    return NextResponse.json(info);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Не удалось прочитать связи";
    const status = msg === "Некорректный путь" ? 400 : 404;
    return NextResponse.json({ error: msg }, { status });
  }
}
