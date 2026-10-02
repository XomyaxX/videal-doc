import { NextResponse } from "next/server";
import { findLibraryShare, listShareFolders } from "@/lib/library";

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const root = await findLibraryShare(token);
  if (!root) return NextResponse.json({ error: "Ссылка не действует" }, { status: 404 });
  if (!root.shareEdit) return NextResponse.json({ error: "Редактирование закрыто" }, { status: 403 });
  const rows = await listShareFolders(root.id);
  return NextResponse.json({ rows, rootId: root.id });
}
