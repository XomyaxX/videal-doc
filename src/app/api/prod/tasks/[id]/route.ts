import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userCan } from "@/lib/types";
import { applyStatus, setTaskDiskDir, taskInclude } from "@/lib/prod-server";
import { PROD_STATUSES, canLeadProd, canSeeProdTask, type ProdStatus } from "@/lib/prod";
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
  const hasStatus = PROD_STATUSES.includes(status as ProdStatus);
  const hasDisk = body?.diskDir !== undefined && body?.diskDir !== null;
  const hasTitle = typeof body?.title === "string";
  if (!hasStatus && !hasDisk && !hasTitle) {
    return NextResponse.json({ error: "Неизвестный статус" }, { status: 400 });
  }
  try {
    if (hasTitle) {
      const task = await prisma.task.findUnique({
        where: { id },
        include: { assignee: { include: { department: true } } },
      });
      if (!task) return NextResponse.json({ error: "Нет задачи" }, { status: 404 });
      if (task.deletedAt) return NextResponse.json({ error: "Задача удалена" }, { status: 400 });
      const work = task.assigneeId === session.user.id || task.helperId === session.user.id;
      const lead = canLeadProd(session.user, task.stage, task.assignee?.department?.name);
      if (!work && !lead) return NextResponse.json({ error: "Нет права" }, { status: 403 });
      const title = String(body.title).trim().slice(0, 160);
      const where = task.shotId
        ? { shotId: task.shotId }
        : task.assetId
          ? { assetId: task.assetId }
          : task.sceneId
            ? { sceneId: task.sceneId, shotId: null }
            : { id: task.id };
      await prisma.task.updateMany({ where, data: { title } });
      await prisma.taskEvent.create({
        data: { taskId: id, userId: session.user.id, action: "rename", body: title || "сбросили название" },
      });
    }
    if (hasDisk) {
      await setTaskDiskDir({ user: session.user, taskId: id, input: String(body.diskDir) });
    }
    if (hasStatus) {
      await applyStatus({
        user: session.user,
        taskId: id,
        status: status as ProdStatus,
        comment: body?.comment ? String(body.comment) : undefined,
        assigneeId: body?.assigneeId === undefined ? undefined : body.assigneeId || null,
        helperId: body?.helperId === undefined ? undefined : body.helperId || null,
        blockedReason: body?.blockedReason ? String(body.blockedReason) : undefined,
      });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Ошибка" }, { status: 400 });
  }
}
