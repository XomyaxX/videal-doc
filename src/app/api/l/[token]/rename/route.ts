import { NextRequest, NextResponse } from "next/server";
import { assertInShare, findLibraryShare, renameLibraryFolder } from "@/lib/library";

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const root = await findLibraryShare(token);
  if (!root) return NextResponse.json({ error: "Ссылка не действует" }, { status: 404 });
  if (!root.shareEdit) return NextResponse.json({ error: "Редактирование закрыто" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const id = String(body?.id || "");
  try {
    await assertInShare(root.id, id);
    const row = await renameLibraryFolder(id, String(body?.title || ""));
    return NextResponse.json({ ok: true, title: row.title });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Не удалось" }, { status: 400 });
  }
}
