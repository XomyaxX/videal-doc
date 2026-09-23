import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userCan } from "@/lib/types";
import { canLeadProd } from "@/lib/prod";
import { assignJobBySkills, canSeeJob, setJobMembers } from "@/lib/jobs";
import { notify } from "@/lib/notify";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !userCan(session.user, "prod.view")) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!(await canSeeJob(session.user, id))) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const job = await prisma.job.findUnique({
    where: { id },
    include: {
      author: { select: { lastName: true, firstName: true, middleName: true } },
      episode: { select: { id: true, code: true, name: true } },
      members: {
        include: {
          user: {
            select: {
              id: true,
              lastName: true,
              firstName: true,
              middleName: true,
              skills: { include: { skill: { select: { code: true, name: true } } } },
            },
          },
        },
      },
    },
  });
  if (!job) return NextResponse.json({ error: "Нет" }, { status: 404 });
  return NextResponse.json({ job });
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const job = await prisma.job.findUnique({
    where: { id },
    include: { members: { select: { userId: true } } },
  });
  if (!job) return NextResponse.json({ error: "Нет" }, { status: 404 });
  const lead = session && (canLeadProd(session.user) || job.authorId === session.user.id);
  if (!session || !lead) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  if (job.deletedAt) return NextResponse.json({ error: "Задача удалена — сначала восстановите" }, { status: 400 });
  try {
    if (Array.isArray(body?.memberIds)) {
      if (!canLeadProd(session.user)) return NextResponse.json({ error: "Нет права" }, { status: 403 });
      await setJobMembers({ user: session.user, jobId: id, memberIds: body.memberIds.map(String) });
    }
    const data: Record<string, unknown> = {};
    if (body?.title !== undefined) {
      const title = String(body.title || "").trim();
      if (!title) return NextResponse.json({ error: "Укажите название" }, { status: 400 });
      data.title = title.slice(0, 200);
    }
    if (body?.description !== undefined) data.description = String(body.description || "").trim().slice(0, 8000);
    if (body?.status === "open" || body?.status === "done" || body?.status === "archived") {
      if (!canLeadProd(session.user)) return NextResponse.json({ error: "Нет права" }, { status: 403 });
      data.status = body.status;
    }
    if (body?.startsAt !== undefined) data.startsAt = body.startsAt ? new Date(body.startsAt) : null;
    if (body?.dueAt !== undefined) data.dueAt = body.dueAt ? new Date(body.dueAt) : null;
    if (Object.keys(data).length) await prisma.job.update({ where: { id }, data });
    if (typeof body?.description === "string" && String(body.description).trim() !== job.description) {
      const text = String(body.description || "").trim();
      for (const m of job.members) {
        if (m.userId === session.user.id) continue;
        await notify({
          userId: m.userId,
          title: text ? "Обновили ТЗ крупной задачи" : "Убрали ТЗ крупной задачи",
          body: text ? text.slice(0, 160) : job.title,
          link: `/prod/jobs/${job.id}`,
          urgency: "normal",
        });
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Ошибка" }, { status: 400 });
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !canLeadProd(session.user)) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  if (body?.action === "assign") {
    try {
      const result = await assignJobBySkills({ user: session.user, jobId: id });
      return NextResponse.json(result);
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Ошибка" }, { status: 400 });
    }
  }
  return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
}
