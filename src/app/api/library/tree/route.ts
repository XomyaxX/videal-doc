import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canViewLibrary, listLibraryFolders } from "@/lib/library";

export async function GET() {
  const session = await getSession();
  if (!session || !canViewLibrary(session.user)) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const rows = await listLibraryFolders(session.user);
  return NextResponse.json({ rows });
}
