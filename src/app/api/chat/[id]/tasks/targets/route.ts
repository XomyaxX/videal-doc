import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertChatWriter } from "@/lib/chat-widgets";
import { WORK_STATUSES } from "@/lib/prod";
import { taskTitle } from "@/lib/prod-server";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await ctx.params;
  try {
    await assertChatWriter(session.user, id);
  } catch {
    return NextResponse.json({ error: "Нет чата" }, { status: 404 });
  }
  const userId = String(req.nextUrl.searchParams.get("userId") || session.user.id);
  const member = await prisma.chatMember.findFirst({
    where: { chatId: id, userId, leftAt: null },
  });
  if (!member) return NextResponse.json({ error: "Человек не в этом чате" }, { status: 400 });

  const [peers, jobs, tasks] = await Promise.all([
    prisma.chatTask.findMany({
      where: { assigneeId: userId, status: { not: "done" }, parentId: null },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: { id: true, title: true, dueAt: true },
    }),
    prisma.job.findMany({
      where: {
        deletedAt: null,
        status: { not: "archived" },
        OR: [{ authorId: userId }, { members: { some: { userId } } }, { tasks: { some: { assigneeId: userId, deletedAt: null } } }],
      },
      orderBy: { updatedAt: "desc" },
      take: 30,
      select: { id: true, title: true },
    }),
    prisma.task.findMany({
      where: {
        deletedAt: null,
        status: { in: [...WORK_STATUSES] },
        OR: [{ assigneeId: userId }, { helperId: userId }],
      },
      orderBy: { updatedAt: "desc" },
      take: 40,
      include: { shot: true, scene: true, asset: true, episode: true },
    }),
  ]);

  return NextResponse.json({
    peers: peers.map((p) => ({
      id: `peer:${p.id}`,
      kind: "peer",
      title: p.title,
    })),
    jobs: jobs.map((j) => ({
      id: `job:${j.id}`,
      kind: "job",
      title: `Крупная · ${j.title}`,
    })),
    tasks: tasks.map((t) => ({
      id: `task:${t.id}`,
      kind: "task",
      title: taskTitle(t),
    })),
  });
}
