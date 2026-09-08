import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageLibrary, canViewLibrary, serializeLibrary } from "@/lib/library";
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
  return NextResponse.json({
    row: {
      ...serializeLibrary(row),
      authorName: fullName(row.author),
      taskCount: row.tasks.length,
    },
  });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !canManageLibrary(session.user)) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const { id } = await ctx.params;
  await prisma.libraryItem.updateMany({
    where: { id, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
