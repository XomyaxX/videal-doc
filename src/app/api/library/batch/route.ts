import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canManageLibrary, copyLibraryItems, moveLibraryItems } from "@/lib/library";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !canManageLibrary(session.user)) {
    return NextResponse.json({ error: "Перенос делает руководство" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const action = body?.action === "copy" ? "copy" : body?.action === "move" ? "move" : "";
  const ids = Array.isArray(body?.ids) ? body.ids.map(String) : [];
  const destParentId = body?.destParentId ? String(body.destParentId) : "";
  if (!action) return NextResponse.json({ error: "Нет действия" }, { status: 400 });
  try {
    if (action === "move") await moveLibraryItems(ids, destParentId || null);
    else await copyLibraryItems(ids, destParentId || null, session.user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Не удалось" }, { status: 400 });
  }
}
