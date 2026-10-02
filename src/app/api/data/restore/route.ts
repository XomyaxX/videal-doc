import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { auditRemote, auditRequestIp } from "@/lib/audit";
import { canWorkData, restoreTrash } from "@/lib/share-data";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !canWorkData(session.user)) {
    return NextResponse.json({ error: "Восстанавливать нельзя" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const id = String(body?.id || "");
  try {
    const rel = await restoreTrash(id);
    await auditRemote({
      user: session.user,
      action: "data.restore",
      entity: "data",
      entityId: id.slice(0, 200),
      details: rel,
      ip: auditRequestIp(req),
      throttle: false,
    });
    return NextResponse.json({ ok: true, rel });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Не удалось" }, { status: 400 });
  }
}
