import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canViewData, listDataFolders, normalizeRel } from "@/lib/share-data";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !canViewData(session.user)) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  let rel = "";
  try {
    rel = normalizeRel(req.nextUrl.searchParams.get("p") || "");
  } catch {
    return NextResponse.json({ error: "Некорректный путь" }, { status: 400 });
  }
  try {
    const data = await listDataFolders(rel);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Нет папки" }, { status: 400 });
  }
}
