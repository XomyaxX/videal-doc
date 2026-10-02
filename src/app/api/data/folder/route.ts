import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { auditRemote, auditRequestIp } from "@/lib/audit";
import { canWorkData, mkdirData } from "@/lib/share-data";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !canWorkData(session.user)) {
    return NextResponse.json({ error: "Создавать папки нельзя" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const dir = String(body?.dir || "");
  const name = String(body?.name || body?.title || "");
  try {
    const rel = await mkdirData(dir, name);
    await auditRemote({
      user: session.user,
      action: "data.folder",
      entity: "data",
      entityId: rel.slice(0, 200),
      details: rel,
      ip: auditRequestIp(req),
      throttle: false,
    });
    return NextResponse.json({ ok: true, rel });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Не удалось" }, { status: 400 });
  }
}
