import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canLeadProd } from "@/lib/prod";
import { attachLibraryToTask, canViewLibrary, serializeLibrary } from "@/lib/library";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !canViewLibrary(session.user)) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const links = await prisma.taskLibraryItem.findMany({
    where: { taskId: id, item: { deletedAt: null } },
    include: {
      item: {
        include: {
          author: { select: { lastName: true, firstName: true, middleName: true } },
          files: { orderBy: { sortOrder: "asc" } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ rows: links.map((l) => serializeLibrary(l.item)) });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !canLeadProd(session.user)) {
    return NextResponse.json({ error: "Прикреплять материалы может руководство" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return NextResponse.json({ error: "Нет задачи" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const itemIds = Array.isArray(body.itemIds) ? body.itemIds.map(String) : [];
  await attachLibraryToTask(id, itemIds);
  return NextResponse.json({ ok: true });
}
