import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userCan } from "@/lib/types";
import {
  PIPE_MANAGER_STATUSES,
  PIPE_WORKER_STATUSES,
  isPipeDept,
  isPipeManager,
  userPipeDepts,
} from "@/lib/pipe-board";
import { loadPipeDesk } from "@/lib/pipe-server";

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

function uniqIds(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw.map(String) : raw ? [String(raw)] : [];
  return [...new Set(list.map((s) => s.trim()).filter(Boolean))];
}

async function setTaskCrew(taskId: string, userIds: string[]) {
  const ids = uniqIds(userIds);
  await prisma.taskCrew.deleteMany({ where: { taskId } });
  if (ids.length) {
    await prisma.taskCrew.createMany({ data: ids.map((userId) => ({ taskId, userId })) });
  }
  return ids;
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !userCan(session.user, "prod.view")) return bad("Нет права", 403);
  const data = await loadPipeDesk(session.user, req.nextUrl.searchParams.get("dept"));
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !userCan(session.user, "prod.view")) return bad("Нет права", 403);
  const manager = isPipeManager(session.user);
  const body = await req.json().catch(() => null);
  const action = String(body?.action || "");
  try {
    if (action === "createProject") {
      if (!manager) return bad("Нет права", 403);
      const dept = String(body.dept || "");
      if (!isPipeDept(dept) || !userPipeDepts(session.user).includes(dept)) return bad("Нет отдела");
      const name = String(body.name || "Новый проект").trim().slice(0, 120) || "Новый проект";
      const row = await prisma.pipeProject.create({
        data: { dept, name, createdById: session.user.id },
      });
      return NextResponse.json({ id: row.id });
    }
    if (action === "renameProject") {
      if (!manager) return bad("Нет права", 403);
      await prisma.pipeProject.update({
        where: { id: String(body.projectId) },
        data: { name: String(body.name || "").trim().slice(0, 120) || "Проект" },
      });
      return NextResponse.json({ ok: true });
    }
    if (action === "publishProject") {
      if (!manager) return bad("Нет права", 403);
      await prisma.pipeProject.update({ where: { id: String(body.projectId) }, data: { published: true } });
      return NextResponse.json({ ok: true });
    }
    if (action === "deleteProject") {
      if (!manager) return bad("Нет права", 403);
      await prisma.pipeProject.delete({ where: { id: String(body.projectId) } });
      return NextResponse.json({ ok: true });
    }
    if (action === "createChapter") {
      if (!manager) return bad("Нет права", 403);
      const projectId = String(body.projectId);
      const count = await prisma.pipeChapter.count({ where: { projectId } });
      const row = await prisma.pipeChapter.create({
        data: {
          projectId,
          name: String(body.name || "Этап").trim().slice(0, 120) || "Этап",
          sortOrder: count,
        },
      });
      return NextResponse.json({ id: row.id });
    }
    if (action === "renameChapter") {
      if (!manager) return bad("Нет права", 403);
      await prisma.pipeChapter.update({
        where: { id: String(body.chapterId) },
        data: { name: String(body.name || "").trim().slice(0, 120) || "Этап" },
      });
      return NextResponse.json({ ok: true });
    }
    if (action === "deleteChapter") {
      if (!manager) return bad("Нет права", 403);
      await prisma.pipeChapter.delete({ where: { id: String(body.chapterId) } });
      return NextResponse.json({ ok: true });
    }
    if (action === "createGroup") {
      if (!manager) return bad("Нет права", 403);
      const projectId = String(body.projectId);
      const chapterId = body.chapterId ? String(body.chapterId) : null;
      if (chapterId) {
        const ch = await prisma.pipeChapter.findFirst({ where: { id: chapterId, projectId } });
        if (!ch) return bad("Сначала создайте этап");
      }
      const count = await prisma.pipeGroup.count({ where: { projectId, ...(chapterId ? { chapterId } : {}) } });
      const row = await prisma.pipeGroup.create({
        data: {
          projectId,
          chapterId,
          name: String(body.name || "Группа").trim().slice(0, 80) || "Группа",
          sortOrder: count,
        },
      });
      return NextResponse.json({ id: row.id });
    }
    if (action === "renameGroup") {
      if (!manager) return bad("Нет права", 403);
      await prisma.pipeGroup.update({
        where: { id: String(body.groupId) },
        data: { name: String(body.name || "").trim().slice(0, 80) || "Группа" },
      });
      return NextResponse.json({ ok: true });
    }
    if (action === "deleteGroup") {
      if (!manager) return bad("Нет права", 403);
      await prisma.pipeGroup.delete({ where: { id: String(body.groupId) } });
      return NextResponse.json({ ok: true });
    }
    if (action === "setGroupMembers") {
      if (!manager) return bad("Нет права", 403);
      const groupId = String(body.groupId);
      const ids: string[] = Array.isArray(body.userIds) ? body.userIds.map(String) : [];
      await prisma.$transaction([
        prisma.pipeGroupMember.deleteMany({ where: { groupId } }),
        ...ids.map((userId) => prisma.pipeGroupMember.create({ data: { groupId, userId } })),
      ]);
      return NextResponse.json({ ok: true });
    }
    if (action === "attachWorker") {
      if (!manager) return bad("Нет права", 403);
      const projectId = String(body.projectId);
      const userId = String(body.userId);
      await prisma.pipeProjectWorker.upsert({
        where: { projectId_userId: { projectId, userId } },
        create: { projectId, userId },
        update: {},
      });
      return NextResponse.json({ ok: true });
    }
    if (action === "detachWorker") {
      if (!manager) return bad("Нет права", 403);
      await prisma.pipeProjectWorker.deleteMany({
        where: { projectId: String(body.projectId), userId: String(body.userId) },
      });
      return NextResponse.json({ ok: true });
    }
    if (action === "createTask") {
      if (!manager) return bad("Нет права", 403);
      const projectId = String(body.projectId);
      const project = await prisma.pipeProject.findUnique({ where: { id: projectId } });
      if (!project) return bad("Нет проекта", 404);
      let chapterId = body.chapterId ? String(body.chapterId) : null;
      const groupId = body.groupId ? String(body.groupId) : null;
      if (groupId) {
        const group = await prisma.pipeGroup.findFirst({ where: { id: groupId, projectId } });
        if (!group) return bad("Нет группы", 404);
        if (group.chapterId) chapterId = group.chapterId;
      }
      if (chapterId) {
        const ch = await prisma.pipeChapter.findFirst({ where: { id: chapterId, projectId } });
        if (!ch) return bad("Сначала создайте этап");
      } else {
        return bad("Добавить задачу можно только после создания раздела");
      }
      const startsAt = body.startsAt ? new Date(String(body.startsAt)) : null;
      const dueAt = body.dueAt ? new Date(String(body.dueAt)) : null;
      const crewIds = uniqIds(body.assigneeIds?.length ? body.assigneeIds : body.assigneeId);
      const row = await prisma.task.create({
        data: {
          kind: "pipe",
          stage: "task",
          status: "todo",
          title: String(body.title || "Новая задача").trim().slice(0, 160) || "Новая задача",
          brief: String(body.brief || ""),
          pipeProjectId: projectId,
          pipeChapterId: chapterId,
          pipeGroupId: groupId,
          assigneeId: crewIds[0] || null,
          assignedById: session.user.id,
          startsAt: startsAt && !Number.isNaN(+startsAt) ? startsAt : null,
          dueAt: dueAt && !Number.isNaN(+dueAt) ? dueAt : null,
        },
      });
      await setTaskCrew(row.id, crewIds);
      return NextResponse.json({ id: row.id });
    }
    if (action === "updateTask") {
      const id = String(body.taskId);
      const task = await prisma.task.findUnique({
        where: { id },
        include: { pipeProject: true, crew: true },
      });
      if (!task || task.kind !== "pipe") return bad("Нет задачи", 404);
      const work =
        task.assigneeId === session.user.id ||
        task.helperId === session.user.id ||
        task.crew.some((c) => c.userId === session.user.id);
      if (!manager && !work && !userCan(session.user, "prod.work")) return bad("Нет права", 403);
      const data: Record<string, unknown> = {};
      let crewIds: string[] | null = null;
      if (typeof body.title === "string" && (manager || work)) data.title = body.title.trim().slice(0, 160);
      if (typeof body.brief === "string" && manager) data.brief = String(body.brief).slice(0, 8000);
      if (typeof body.projectUrl === "string") data.projectUrl = String(body.projectUrl).trim().slice(0, 2000);
      if (body.startsAt !== undefined && manager) {
        const d = body.startsAt ? new Date(String(body.startsAt)) : null;
        data.startsAt = d && !Number.isNaN(+d) ? d : null;
      }
      if (body.dueAt !== undefined && manager) {
        const d = body.dueAt ? new Date(String(body.dueAt)) : null;
        data.dueAt = d && !Number.isNaN(+d) ? d : null;
      }
      if ((body.assigneeIds !== undefined || body.assigneeId !== undefined) && manager) {
        crewIds = body.assigneeIds !== undefined ? uniqIds(body.assigneeIds) : uniqIds(body.assigneeId);
        data.assigneeId = crewIds[0] || null;
        data.assignedById = session.user.id;
        if (crewIds[0] && task.status === "appoint") data.status = "todo";
      }
      if (body.chapterId !== undefined && manager) data.pipeChapterId = body.chapterId ? String(body.chapterId) : null;
      if (body.groupId !== undefined && manager) {
        const groupId = body.groupId ? String(body.groupId) : null;
        data.pipeGroupId = groupId;
        if (groupId) {
          const group = await prisma.pipeGroup.findUnique({ where: { id: groupId } });
          if (group?.chapterId) data.pipeChapterId = group.chapterId;
        }
      }
      if (typeof body.status === "string") {
        const status = String(body.status) === "appoint" ? "todo" : String(body.status);
        const allowed = manager ? PIPE_MANAGER_STATUSES : PIPE_WORKER_STATUSES;
        if (!(allowed as readonly string[]).includes(status)) return bad("Этот статус недоступен");
        data.status = status;
        if (status === "wip") {
          const now = new Date();
          const start = (data.startsAt as Date | null | undefined) ?? task.startsAt;
          if (!start || now < start) data.startsAt = now;
        }
      }
      await prisma.task.update({ where: { id }, data });
      if (crewIds) await setTaskCrew(id, crewIds);
      return NextResponse.json({ ok: true });
    }
    if (action === "deleteTask") {
      if (!manager) return bad("Нет права", 403);
      await prisma.task.update({
        where: { id: String(body.taskId) },
        data: { deletedAt: new Date() },
      });
      return NextResponse.json({ ok: true });
    }
    return bad("Неизвестное действие");
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Ошибка" }, { status: 400 });
  }
}
