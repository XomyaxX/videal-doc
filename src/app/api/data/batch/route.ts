import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { auditRemote, auditRequestIp } from "@/lib/audit";
import { canWorkData, copyData, DATA_BATCH_MAX, moveData, normalizeRel } from "@/lib/share-data";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !canWorkData(session.user)) {
    return NextResponse.json({ error: "Копировать и перемещать нельзя" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const action = body?.action === "copy" ? "copy" : body?.action === "move" ? "move" : "";
  const items = Array.isArray(body?.items) ? body.items.map(String) : [];
  let dest = "";
  try {
    dest = normalizeRel(String(body?.dest || ""));
  } catch {
    return NextResponse.json({ error: "Некорректный путь" }, { status: 400 });
  }
  if (!action) return NextResponse.json({ error: "Нет действия" }, { status: 400 });
  if (!items.length) return NextResponse.json({ error: "Не выбрано" }, { status: 400 });
  if (items.length > DATA_BATCH_MAX) {
    return NextResponse.json({ error: `За один раз не больше ${DATA_BATCH_MAX} объектов` }, { status: 400 });
  }
  const rels: string[] = [];
  try {
    for (const raw of items) {
      const src = normalizeRel(raw);
      const rel = action === "move" ? await moveData(src, dest) : await copyData(src, dest);
      rels.push(rel);
      await auditRemote({
        user: session.user,
        action: action === "move" ? "data.move" : "data.copy",
        entity: "data",
        entityId: rel.slice(0, 200),
        details: `${src} → ${rel}`,
        ip: auditRequestIp(req),
        throttle: false,
      });
    }
    return NextResponse.json({ ok: true, rels });
  } catch (e) {
    return NextResponse.json(
      { ok: false, rels, error: e instanceof Error ? e.message : "Не удалось" },
      { status: 400 },
    );
  }
}
