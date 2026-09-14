import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serializeTask } from "@/lib/chat-widgets";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await ctx.params;
  const task = await prisma.chatTask.findUnique({ where: { id } });
  if (!task) return NextResponse.json({ error: "Нет поручения" }, { status: 404 });
  if (task.authorId !== session.user.id && task.assigneeId !== session.user.id) {
    return NextResponse.json({ error: "Это не ваше поручение" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const status = String(body?.status || "");
  if (status !== "todo" && status !== "done") {
    return NextResponse.json({ error: "Неизвестный статус" }, { status: 400 });
  }
  const next = await prisma.chatTask.update({
    where: { id: task.id },
    data: { status, completedAt: status === "done" ? new Date() : null },
    include: {
      assignee: { select: { lastName: true, firstName: true, middleName: true } },
      author: { select: { lastName: true, firstName: true, middleName: true } },
      parent: { select: { title: true } },
      linkedJob: { select: { id: true, title: true } },
      linkedTask: {
        select: {
          id: true,
          title: true,
          stage: true,
          shot: { select: { code: true } },
          scene: { select: { code: true } },
          asset: { select: { name: true } },
        },
      },
    },
  });
  return NextResponse.json({ task: serializeTask(next) });
}
