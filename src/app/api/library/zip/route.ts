import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canViewLibrary, collectZipEntries, libraryItemVisible, libraryZipResponse } from "@/lib/library";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !canViewLibrary(session.user)) {
    return new NextResponse("Нет права", { status: 403 });
  }
  const folder = (req.nextUrl.searchParams.get("folder") || "").trim();
  const idsParam = (req.nextUrl.searchParams.get("ids") || "").trim();
  let ids = idsParam ? idsParam.split(",").map((s) => s.trim()).filter(Boolean) : [];
  let name = "hranilische";
  if (!ids.length) {
    if (folder) {
      const row = await prisma.libraryItem.findFirst({
        where: { id: folder, deletedAt: null },
        select: { id: true, title: true },
      });
      if (!row) return new NextResponse("Нет папки", { status: 404 });
      if (!(await libraryItemVisible(session.user, row.id))) return new NextResponse("Нет папки", { status: 404 });
      ids = [row.id];
      name = row.title;
    } else {
      const roots = await prisma.libraryItem.findMany({
        where: { deletedAt: null, parentId: null },
        select: { id: true },
      });
      ids = roots.map((r) => r.id);
    }
  } else if (ids.length === 1) {
    const row = await prisma.libraryItem.findFirst({
      where: { id: ids[0], deletedAt: null },
      select: { title: true },
    });
    if (row) name = row.title;
  }
  try {
    const entries = await collectZipEntries(ids, session.user);
    return await libraryZipResponse(name, entries);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Не удалось собрать архив" }, { status: 400 });
  }
}
