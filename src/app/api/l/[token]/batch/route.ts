import { NextRequest, NextResponse } from "next/server";
import { assertInShare, copyLibraryItems, findLibraryShare, moveLibraryItems } from "@/lib/library";

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const root = await findLibraryShare(token);
  if (!root) return NextResponse.json({ error: "Ссылка не действует" }, { status: 404 });
  if (!root.shareEdit) return NextResponse.json({ error: "Редактирование закрыто" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const action = body?.action === "copy" ? "copy" : body?.action === "move" ? "move" : "";
  const ids = Array.isArray(body?.ids) ? body.ids.map(String) : [];
  const destParentId = String(body?.destParentId || root.id);
  if (!action) return NextResponse.json({ error: "Нет действия" }, { status: 400 });
  try {
    await assertInShare(root.id, destParentId || root.id);
    for (const id of ids) await assertInShare(root.id, id);
    if (action === "move") await moveLibraryItems(ids, destParentId);
    else await copyLibraryItems(ids, destParentId, root.authorId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Не удалось" }, { status: 400 });
  }
}
