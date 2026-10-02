import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageLibrary, canViewLibrary, libraryItemVisible, renameLibraryFolder, serializeLibrary } from "@/lib/library";
import { fullName } from "@/lib/names";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !canViewLibrary(session.user)) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const row = await prisma.libraryItem.findFirst({
    where: { id, deletedAt: null },
    include: {
      author: { select: { lastName: true, firstName: true, middleName: true } },
      files: { orderBy: { sortOrder: "asc" } },
      tasks: { include: { task: { select: { id: true, stage: true, kind: true } } } },
    },
  });
  if (!row) return NextResponse.json({ error: "Нет" }, { status: 404 });
  if (!(await libraryItemVisible(session.user, id))) {
    return NextResponse.json({ error: "Нет" }, { status: 404 });
  }
  return NextResponse.json({
    row: {
      ...serializeLibrary(row),
      authorName: fullName(row.author),
      taskCount: row.tasks.length,
    },
  });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !canManageLibrary(session.user)) {
    return NextResponse.json({ error: "Переименовывает руководство" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  try {
    const row = await renameLibraryFolder(id, String(body?.title || ""));
    return NextResponse.json({ ok: true, title: row.title });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Не удалось" }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !canManageLibrary(session.user)) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const row = await prisma.libraryItem.findFirst({ where: { id, deletedAt: null } });
  if (!row) return NextResponse.json({ error: "Нет" }, { status: 404 });
  await prisma.$transaction([
    prisma.libraryItem.updateMany({ where: { parentId: id, deletedAt: null }, data: { parentId: row.parentId } }),
    prisma.libraryItem.update({ where: { id }, data: { deletedAt: new Date() } }),
  ]);
  return NextResponse.json({ ok: true });
}
