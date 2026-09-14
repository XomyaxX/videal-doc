import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertChatWriter, notifyChatMembers, postChatCard, serializeTask } from "@/lib/chat-widgets";
import { canLeadProd } from "@/lib/prod";
import { createJob } from "@/lib/jobs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await ctx.params;
  try {
    await assertChatWriter(session.user, id);
  } catch {
    return NextResponse.json({ error: "Нет чата" }, { status: 404 });
  }
  const body = await req.json().catch(() => null);
  const title = String(body?.title || "").trim().slice(0, 200);
  if (!title) return NextResponse.json({ error: "Напишите задачу" }, { status: 400 });
  const assigneeId = String(body?.assigneeId || "") || null;
  if (assigneeId) {
    const member = await prisma.chatMember.findFirst({
      where: { chatId: id, userId: assigneeId, leftAt: null },
    });
    if (!member) return NextResponse.json({ error: "Человек не в этом чате" }, { status: 400 });
  }
  const dueRaw = String(body?.dueAt || "");
  const dueAt = dueRaw ? new Date(`${dueRaw.slice(0, 10)}T12:00:00+06:00`) : null;
  const rawKind = String(body?.kind || "task");
  const kind = rawKind === "sub" || rawKind === "epic" || rawKind === "task" ? rawKind : rawKind === "root" ? "epic" : "task";
  let parentId: string | null = null;
  let linkedTaskId: string | null = null;
  let linkedJobId: string | null = null;
  const attach = String(body?.attachId || "");
  if (kind === "sub") {
    if (!attach) return NextResponse.json({ error: "Выберите, к чему привязать подзадачу" }, { status: 400 });
    const [atype, aid] = attach.split(":");
    const owner = assigneeId || session.user.id;
    if (atype === "peer") {
      const parent = await prisma.chatTask.findFirst({
        where: { id: aid, assigneeId: owner, status: { not: "done" }, parentId: null },
      });
      if (!parent) return NextResponse.json({ error: "Нет такого поручения" }, { status: 400 });
      parentId = parent.id;
    } else if (atype === "job") {
      const job = await prisma.job.findFirst({
        where: {
          id: aid,
          deletedAt: null,
          OR: [{ authorId: owner }, { members: { some: { userId: owner } } }, { tasks: { some: { assigneeId: owner } } }],
        },
      });
      if (!job) return NextResponse.json({ error: "Нет такой крупной задачи" }, { status: 400 });
      linkedJobId = job.id;
    } else if (atype === "task") {
      const prod = await prisma.task.findFirst({
        where: { id: aid, deletedAt: null, OR: [{ assigneeId: owner }, { helperId: owner }] },
      });
      if (!prod) return NextResponse.json({ error: "Нет такой задачи" }, { status: 400 });
      linkedTaskId = prod.id;
    } else {
      return NextResponse.json({ error: "Непонятная привязка" }, { status: 400 });
    }
  }
  let prodTaskId = "";
  if (body?.createProd) {
    if (!canLeadProd(session.user)) {
      return NextResponse.json({ error: "В производство может завести руководитель" }, { status: 403 });
    }
    const job = await createJob({
      user: session.user,
      title,
      description: String(body?.body || "").trim(),
      dueAt: dueAt && !Number.isNaN(dueAt.getTime()) ? dueAt : null,
      memberIds: assigneeId ? [assigneeId] : [],
    });
    prodTaskId = job.id;
  }
  const msg = await postChatCard({
    chatId: id,
    userId: session.user.id,
    type: "task",
    text: title,
  });
  const task = await prisma.chatTask.create({
    data: {
      chatId: id,
      messageId: msg.id,
      authorId: session.user.id,
      assigneeId,
      title,
      body: String(body?.body || "").trim().slice(0, 2000),
      dueAt: dueAt && !Number.isNaN(dueAt.getTime()) ? dueAt : null,
      prodTaskId,
      kind,
      parentId,
      linkedTaskId,
      linkedJobId,
    },
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
  if (assigneeId && assigneeId !== session.user.id) {
    await notifyChatMembers({
      chatId: id,
      exceptUserId: session.user.id,
      onlyUserIds: [assigneeId],
      title: "Вам поручение",
      body: title,
    });
  }
  return NextResponse.json({ id: task.id, messageId: msg.id, task: serializeTask(task) });
}
