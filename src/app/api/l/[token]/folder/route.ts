import { NextRequest, NextResponse } from "next/server";
import { assertInShare, createLibraryFolder, findLibraryShare } from "@/lib/library";

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const root = await findLibraryShare(token);
  if (!root) return NextResponse.json({ error: "Ссылка не действует" }, { status: 404 });
  if (!root.shareCreate) return NextResponse.json({ error: "Нельзя создавать папки по этой ссылке" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const parentId = String(body?.parentId || root.id);
  try {
    await assertInShare(root.id, parentId);
    const row = await createLibraryFolder({
      userId: root.authorId,
      title: String(body?.title || ""),
      parentId,
    });
    return NextResponse.json({ id: row.id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Не удалось" }, { status: 400 });
  }
}
