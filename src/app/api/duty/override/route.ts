import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canEditDuty, setDutyOverride } from "@/lib/duty";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !canEditDuty(session.user)) {
    return NextResponse.json({ error: "Менять график может только администратор" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const ymd = String(body?.ymd || "");
  const kind = body?.kind === "clean" ? "clean" : body?.kind === "trash" ? "trash" : "";
  const ids = Array.isArray(body?.ids) ? body.ids.map(String) : [];
  if (!kind) return NextResponse.json({ error: "Нет типа графика" }, { status: 400 });
  try {
    await setDutyOverride({ ymd, kind, ids });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Не удалось сохранить" }, { status: 400 });
  }
}
