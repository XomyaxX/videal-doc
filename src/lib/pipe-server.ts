import { prisma } from "./prisma";
import { fullName } from "./names";
import { userCan } from "./types";
import type { SessionUser } from "./types";
import {
  defaultPipeDept,
  isPipeDept,
  isPipeManager,
  pipeLiveStatus,
  pipeProgress,
  userPipeDepts,
  type PipeDept,
} from "./pipe-board";

export type PipeDeskPayload = {
  dept: PipeDept;
  depts: PipeDept[];
  manager: boolean;
  me: string;
  people: { id: string; name: string }[];
  projects: {
    id: string;
    name: string;
    dept: string;
    published: boolean;
    pct: number;
    chapters: { id: string; name: string; pct: number }[];
    groups: { id: string; name: string; chapterId: string | null; memberIds: string[]; members: { id: string; name: string }[] }[];
    workers: { id: string; name: string }[];
    tasks: {
      id: string;
      title: string;
      status: string;
      brief: string;
      projectUrl: string;
      startsAt: string | null;
      dueAt: string | null;
      assigneeId: string | null;
      assigneeName: string | null;
      assigneeIds: string[];
      assigneeNames: string[];
      chapterId: string | null;
      groupId: string | null;
      files: { id: string; name: string }[];
    }[];
  }[];
};

type PipeTaskRow = {
  id: string;
  title: string;
  status: string;
  brief: string;
  projectUrl: string;
  startsAt: Date | null;
  dueAt: Date | null;
  assigneeId: string | null;
  helperId: string | null;
  pipeChapterId: string | null;
  pipeGroupId: string | null;
  assignee: { lastName: string; firstName: string; middleName: string | null } | null;
  helper: { lastName: string; firstName: string; middleName: string | null } | null;
  crew: { user: { id: string; lastName: string; firstName: string; middleName: string | null } }[];
  files: { id: string; originalName: string }[];
};

function serializePipeTask(t: PipeTaskRow): PipeDeskPayload["projects"][number]["tasks"][number] {
  const crew = t.crew.length
    ? t.crew.map((c) => ({ id: c.user.id, name: fullName(c.user) }))
    : [
        t.assignee ? { id: t.assigneeId as string, name: fullName(t.assignee) } : null,
        t.helper && t.helperId !== t.assigneeId ? { id: t.helperId as string, name: fullName(t.helper) } : null,
      ].filter((x): x is { id: string; name: string } => Boolean(x));
  const seen = new Set<string>();
  const people = crew.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
  return {
    id: t.id,
    title: t.title,
    status: pipeLiveStatus(t.status),
    brief: t.brief,
    projectUrl: t.projectUrl,
    startsAt: t.startsAt ? t.startsAt.toISOString() : null,
    dueAt: t.dueAt ? t.dueAt.toISOString() : null,
    assigneeId: people[0]?.id || t.assigneeId,
    assigneeName: people.map((p) => p.name).join(", ") || null,
    assigneeIds: people.map((p) => p.id),
    assigneeNames: people.map((p) => p.name),
    chapterId: t.pipeChapterId,
    groupId: t.pipeGroupId,
    files: t.files.map((f) => ({ id: f.id, name: f.originalName })),
  };
}

export async function loadPipeDesk(user: SessionUser, rawDept?: string | null): Promise<PipeDeskPayload> {
  const manager = isPipeManager(user);
  const allowed = userPipeDepts(user);
  const raw = rawDept || defaultPipeDept(user);
  const dept: PipeDept = isPipeDept(raw) && allowed.includes(raw) ? raw : allowed[0] || "mult";
  const projects = await prisma.pipeProject.findMany({
    where: { dept, ...(manager ? {} : { published: true }) },
    orderBy: { createdAt: "asc" },
    include: {
      chapters: { orderBy: { sortOrder: "asc" } },
      groups: {
        orderBy: { sortOrder: "asc" },
        include: {
          members: {
            include: { user: { select: { id: true, lastName: true, firstName: true, middleName: true } } },
          },
        },
      },
      workers: {
        include: { user: { select: { id: true, lastName: true, firstName: true, middleName: true } } },
      },
      tasks: {
        where: { deletedAt: null },
        include: {
          assignee: { select: { lastName: true, firstName: true, middleName: true } },
          helper: { select: { lastName: true, firstName: true, middleName: true } },
          crew: {
            include: { user: { select: { id: true, lastName: true, firstName: true, middleName: true } } },
          },
          files: { orderBy: { createdAt: "desc" }, select: { id: true, originalName: true } },
        },
      },
    },
  });
  const people = await prisma.user.findMany({
    where: { deletedAt: null, status: "active" },
    select: { id: true, lastName: true, firstName: true, middleName: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  return {
    dept,
    depts: allowed,
    manager,
    me: user.id,
    people: people.map((p) => ({ id: p.id, name: fullName(p) })),
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      dept: p.dept,
      published: p.published,
      pct: pipeProgress(p.tasks),
      chapters: p.chapters.map((c) => ({
        id: c.id,
        name: c.name,
        pct: pipeProgress(p.tasks.filter((t) => t.pipeChapterId === c.id)),
      })),
      groups: p.groups.map((g) => ({
        id: g.id,
        name: g.name,
        chapterId: g.chapterId,
        memberIds: g.members.map((m) => m.userId),
        members: g.members.map((m) => ({ id: m.user.id, name: fullName(m.user) })),
      })),
      workers: p.workers.map((w) => ({ id: w.user.id, name: fullName(w.user) })),
      tasks: p.tasks.map((t) => serializePipeTask(t)),
    })),
  };
}

export async function canAccessPipeTask(user: SessionUser, taskId: string) {
  if (!userCan(user, "prod.view")) return false;
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { pipeProject: true, crew: true },
  });
  if (!task || task.kind !== "pipe" || !task.pipeProject) return false;
  const manager = isPipeManager(user);
  if (task.assigneeId === user.id || task.helperId === user.id || task.crew.some((c) => c.userId === user.id)) return true;
  if (!manager && !task.pipeProject.published) return false;
  return manager || userPipeDepts(user).includes(task.pipeProject.dept as PipeDept);
}

export async function loadPipeTaskSheet(user: SessionUser, taskId: string) {
  if (!(await canAccessPipeTask(user, taskId))) return null;
  const manager = isPipeManager(user);
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      pipeProject: {
        include: {
          chapters: { orderBy: { sortOrder: "asc" } },
          groups: {
            orderBy: { sortOrder: "asc" },
            include: {
              members: {
                include: { user: { select: { id: true, lastName: true, firstName: true, middleName: true } } },
              },
            },
          },
          workers: {
            include: { user: { select: { id: true, lastName: true, firstName: true, middleName: true } } },
          },
        },
      },
      assignee: { select: { lastName: true, firstName: true, middleName: true } },
      helper: { select: { lastName: true, firstName: true, middleName: true } },
      crew: {
        include: { user: { select: { id: true, lastName: true, firstName: true, middleName: true } } },
      },
      files: { orderBy: { createdAt: "desc" }, select: { id: true, originalName: true } },
    },
  });
  if (!task || task.kind !== "pipe" || !task.pipeProject) return null;
  if (task.deletedAt && !manager) return null;
  const p = task.pipeProject;
  const people = await prisma.user.findMany({
    where: { deletedAt: null, status: "active" },
    select: { id: true, lastName: true, firstName: true, middleName: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  const serialized = serializePipeTask(task);
  return {
    manager,
    me: user.id,
    people: people.map((u) => ({ id: u.id, name: fullName(u) })),
    project: {
      id: p.id,
      name: p.name,
      dept: p.dept,
      published: p.published,
      pct: 0,
      chapters: p.chapters.map((c) => ({ id: c.id, name: c.name, pct: 0 })),
      groups: p.groups.map((g) => ({
        id: g.id,
        name: g.name,
        chapterId: g.chapterId,
        memberIds: g.members.map((m) => m.userId),
        members: g.members.map((m) => ({ id: m.user.id, name: fullName(m.user) })),
      })),
      workers: p.workers.map((w) => ({ id: w.user.id, name: fullName(w.user) })),
      tasks: [serialized],
    },
    task: serialized,
  };
}
