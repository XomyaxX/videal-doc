import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { auditRemote, auditRequestIp } from "@/lib/audit";
import { canWorkData, moveToTrash } from "@/lib/share-data";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !canWorkData(session.user)) {
    return NextResponse.json({ error: "Удалять из Data нельзя" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const rel = String(body?.p || body?.rel || "");
  try {
    const row = await moveToTrash(rel);
    await auditRemote({
      user: session.user,
      action: "data.trash",
      entity: "data",
      entityId: row.id,
      details: row.rel,
      ip: auditRequestIp(req),
      throttle: false,
    });
    return NextResponse.json({ ok: true, id: row.id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Не удалось" }, { status: 400 });
  }
}
