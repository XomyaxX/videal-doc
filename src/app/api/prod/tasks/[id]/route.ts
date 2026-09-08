import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userCan } from "@/lib/types";
import { applyStatus, taskInclude } from "@/lib/prod-server";
import { PROD_STATUSES, canSeeProdTask, type ProdStatus } from "@/lib/prod";
import { USER_SAFE_SELECT } from "@/lib/user-public";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !userCan(session.user, "prod.view")) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      ...taskInclude,
      events: { include: { user: { select: USER_SAFE_SELECT } }, orderBy: { createdAt: "desc" }, take: 30 },
      files: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!task) return NextResponse.json({ error: "Нет задачи" }, { status: 404 });
  if (!canSeeProdTask(session.user, task)) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  return NextResponse.json({ task });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !userCan(session.user, "prod.work")) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const status = String(body?.status || "");
  if (!PROD_STATUSES.includes(status as ProdStatus)) {
    return NextResponse.json({ error: "Неизвестный статус" }, { status: 400 });
  }
  try {
    await applyStatus({
      user: session.user,
      taskId: id,
      status: status as ProdStatus,
      comment: body?.comment ? String(body.comment) : undefined,
      assigneeId: body?.assigneeId === undefined ? undefined : body.assigneeId || null,
      blockedReason: body?.blockedReason ? String(body.blockedReason) : undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Ошибка" }, { status: 400 });
  }
}
