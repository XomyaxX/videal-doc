import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canManageLibrary, createLibraryFolder } from "@/lib/library";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !canManageLibrary(session.user)) {
    return NextResponse.json({ error: "Папки создаёт руководство" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  try {
    const row = await createLibraryFolder({
      userId: session.user.id,
      title: String(body?.title || ""),
      parentId: String(body?.parentId || ""),
    });
    return NextResponse.json({ id: row.id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Не удалось создать папку" }, { status: 400 });
  }
}
