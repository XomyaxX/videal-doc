import { Prisma } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";
import { audit, auditRequestIp } from "./audit";
import { getSession } from "./auth";
import { fullName } from "./names";
import { prisma } from "./prisma";
import { taskTitle } from "./prod-server";
import {
  assignSortOrders,
  edgeWouldCycle,
  hasSameLink,
  isAssignableEmployee,
  isBoardEdgeKind,
  isBoardStatus,
  normalizeLink,
  stableTopo,
  type BoardEdgeKind,
  type BoardStatus,
} from "./work-board-graph";

export type BoardTaskDto = {
  id: string;
  title: string;
  body: string;
  status: BoardStatus;
  assigneeId: string | null;
  assigneeName: string;
  departmentId: string | null;
  departmentName: string;
  dueOn: string;
  prodTaskId: string | null;
  prodTaskTitle: string;
  posX: number;
  posY: number;
  sortOrder: number;
  version: number;
};

export type BoardEdgeDto = {
  id: string;
  fromId: string;
  toId: string;
  kind: BoardEdgeKind;
};

export type BoardSnapshot = {
  tasks: BoardTaskDto[];
  edges: BoardEdgeDto[];
  updatedAt: string;
};

export class BoardError extends Error {
  status: number;
  snapshot?: BoardSnapshot;
  constructor(status: number, message: string, snapshot?: BoardSnapshot) {
    super(message);
    this.status = status;
    this.snapshot = snapshot;
  }
}

export function workBoardFlagOn() {
  return process.env.WORK_BOARD === "1";
}

export function canUseWorkBoard(user: { roleCode: string }) {
  return workBoardFlagOn() && user.roleCode === "superadmin";
}

export async function boardApiGuard(req: NextRequest) {
  if (!workBoardFlagOn()) {
    return { ok: false as const, res: NextResponse.json({ error: "Раздел выключен" }, { status: 404 }) };
  }
  const session = await getSession();
  if (!session) {
    return { ok: false as const, res: NextResponse.json({ error: "Нужно войти" }, { status: 401 }) };
  }
  if (session.user.roleCode !== "superadmin") {
    return { ok: false as const, res: NextResponse.json({ error: "Нет доступа" }, { status: 403 }) };
  }
  return { ok: true as const, userId: session.user.id, ip: auditRequestIp(req) };
}

export function boardErrorResponse(error: unknown) {
  if (error instanceof BoardError) {
    return NextResponse.json({ error: error.message, snapshot: error.snapshot ?? null }, { status: error.status });
  }
  console.error(error);
  return NextResponse.json({ error: "Не получилось сохранить" }, { status: 500 });
}

const taskInclude = {
  assignee: { select: { lastName: true, firstName: true, middleName: true } },
  department: { select: { name: true } },
  prodTask: {
    select: {
      title: true,
      stage: true,
      shot: { select: { code: true } },
      scene: { select: { code: true, title: true } },
      asset: { select: { name: true } },
      episode: { select: { code: true } },
    },
  },
} satisfies Prisma.WorkBoardTaskInclude;

export async function loadSnapshot(): Promise<BoardSnapshot> {
  const [tasks, edges] = await Promise.all([
    prisma.workBoardTask.findMany({
      where: { deletedAt: null },
      include: taskInclude,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    prisma.workBoardEdge.findMany({ orderBy: { createdAt: "asc" } }),
  ]);
  const times = [
    ...tasks.map((task) => task.updatedAt.getTime()),
    ...edges.map((edge) => edge.createdAt.getTime()),
  ];
  const revision = tasks.reduce((sum, task) => sum + task.version, 0);
  return {
    tasks: tasks.map((task) => ({
      id: task.id,
      title: task.title,
      body: task.body,
      status: isBoardStatus(task.status) ? task.status : "todo",
      assigneeId: task.assigneeId,
      assigneeName: task.assignee ? fullName(task.assignee) : "",
      departmentId: task.departmentId,
      departmentName: task.department?.name ?? "",
      dueOn: task.dueOn,
      prodTaskId: task.prodTaskId,
      prodTaskTitle: task.prodTask ? taskTitle(task.prodTask) : "",
      posX: task.posX,
      posY: task.posY,
      sortOrder: task.sortOrder,
      version: task.version,
    })),
    edges: edges.flatMap((edge) =>
      isBoardEdgeKind(edge.kind)
        ? [{ id: edge.id, fromId: edge.fromId, toId: edge.toId, kind: edge.kind }]
        : [],
    ),
    updatedAt: `${new Date(times.length ? Math.max(...times) : 0).toISOString()}#${revision}.${edges.length}`,
  };
}

async function rebalance(tx: Prisma.TransactionClient) {
  const tasks = await tx.workBoardTask.findMany({
    where: { deletedAt: null },
    select: { id: true, sortOrder: true },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
  const edges = await tx.workBoardEdge.findMany({ select: { fromId: true, toId: true } });
  const order = stableTopo(tasks, edges);
  if (!order) return;
  const next = assignSortOrders(order);
  for (const task of tasks) {
    const sortOrder = next.get(task.id);
    if (sortOrder != null && sortOrder !== task.sortOrder) {
      await tx.workBoardTask.update({ where: { id: task.id }, data: { sortOrder } });
    }
  }
}

function clampPos(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-20000, Math.min(20000, value));
}

async function assertDepartment(departmentId: string | null | undefined) {
  if (!departmentId) return null;
  const row = await prisma.department.findFirst({ where: { id: departmentId, deletedAt: null }, select: { id: true } });
  if (!row) throw new BoardError(400, "Отдел не найден");
  return row.id;
}

async function assertProdTask(prodTaskId: string | null | undefined) {
  if (!prodTaskId) return null;
  const row = await prisma.task.findFirst({ where: { id: prodTaskId, deletedAt: null }, select: { id: true } });
  if (!row) throw new BoardError(400, "Производственная задача не найдена");
  return row.id;
}

function dueOrEmpty(value: string) {
  const due = value.trim();
  if (!due) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) throw new BoardError(400, "Укажите срок датой");
  return due;
}

export async function createTask(
  userId: string,
  input: { title: string; body?: string; departmentId?: string | null },
  ip: string,
) {
  const title = input.title.trim();
  if (!title) throw new BoardError(400, "Укажите название");
  const departmentId = await assertDepartment(input.departmentId);
  const where = { deletedAt: null, ...(departmentId ? { departmentId } : {}) };
  const count = await prisma.workBoardTask.count({ where });
  const maxSort = await prisma.workBoardTask.aggregate({
    where: { deletedAt: null },
    _max: { sortOrder: true },
  });
  const anchor = departmentId
    ? await prisma.workBoardTask.findFirst({
        where: { deletedAt: null, departmentId },
        orderBy: { posX: "desc" },
        select: { posX: true, posY: true },
      })
    : null;
  const task = await prisma.workBoardTask.create({
    data: {
      title: title.slice(0, 200),
      body: (input.body ?? "").slice(0, 4000),
      authorId: userId,
      departmentId,
      sortOrder: (maxSort._max.sortOrder ?? 0) + 10,
      posX: anchor ? anchor.posX + 40 : 48 + (count % 3) * 360,
      posY: anchor ? anchor.posY + 80 : 88 + Math.floor(count / 3) * 200,
    },
  });
  await audit({
    userId,
    action: "workboard.create",
    entity: "workboard_task",
    entityId: task.id,
    details: task.title,
    ip,
  });
  return loadSnapshot();
}

export async function updateTask(
  userId: string,
  id: string,
  patch: {
    version: number;
    title?: string;
    body?: string;
    status?: BoardStatus;
    assigneeId?: string | null;
    departmentId?: string | null;
    dueOn?: string;
    prodTaskId?: string | null;
    posX?: number;
    posY?: number;
  },
  ip: string,
) {
  const data: Prisma.WorkBoardTaskUncheckedUpdateManyInput = { version: { increment: 1 } };
  if (patch.title !== undefined) {
    const title = patch.title.trim();
    if (!title) throw new BoardError(400, "Укажите название");
    data.title = title.slice(0, 200);
  }
  if (patch.body !== undefined) data.body = patch.body.slice(0, 4000);
  if (patch.status !== undefined) {
    if (!isBoardStatus(patch.status)) throw new BoardError(400, "Неизвестный статус");
    data.status = patch.status;
  }
  if (patch.assigneeId !== undefined) {
    if (!patch.assigneeId) {
      data.assigneeId = null;
    } else {
      const person = await prisma.user.findUnique({
        where: { id: patch.assigneeId },
        select: { status: true, deletedAt: true },
      });
      if (!person || !isAssignableEmployee(person)) {
        throw new BoardError(400, "Нельзя назначить уволенного или удалённого сотрудника");
      }
      data.assigneeId = patch.assigneeId;
    }
  }
  if (patch.departmentId !== undefined) data.departmentId = await assertDepartment(patch.departmentId);
  if (patch.dueOn !== undefined) data.dueOn = dueOrEmpty(patch.dueOn);
  if (patch.prodTaskId !== undefined) data.prodTaskId = await assertProdTask(patch.prodTaskId);
  if (patch.posX !== undefined) data.posX = clampPos(patch.posX);
  if (patch.posY !== undefined) data.posY = clampPos(patch.posY);

  const changed = await prisma.workBoardTask.updateMany({
    where: { id, version: patch.version, deletedAt: null },
    data,
  });
  if (!changed.count) {
    const snapshot = await loadSnapshot();
    throw new BoardError(409, "Задачу уже изменили. Доска обновлена.", snapshot);
  }
  const parts = Object.keys(patch).filter((key) => key !== "version" && key !== "posX" && key !== "posY");
  if (parts.length) {
    await audit({
      userId,
      action: "workboard.update",
      entity: "workboard_task",
      entityId: id,
      details: parts.join(","),
      ip,
    });
  }
  return loadSnapshot();
}

export async function deleteTask(userId: string, id: string, ip: string) {
  const existing = await prisma.workBoardTask.findFirst({ where: { id, deletedAt: null }, select: { id: true, title: true } });
  if (!existing) throw new BoardError(404, "Задача не найдена");
  await prisma.$transaction(async (tx) => {
    await tx.workBoardEdge.deleteMany({ where: { OR: [{ fromId: id }, { toId: id }] } });
    await tx.workBoardTask.update({
      where: { id },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
    await rebalance(tx);
  });
  await audit({
    userId,
    action: "workboard.delete",
    entity: "workboard_task",
    entityId: id,
    details: existing.title,
    ip,
  });
  return loadSnapshot();
}

export async function createEdge(
  userId: string,
  sourceId: string,
  targetId: string,
  kind: BoardEdgeKind,
  ip: string,
) {
  if (!isBoardEdgeKind(kind)) throw new BoardError(400, "Неизвестный тип связи");
  const link = normalizeLink(kind, sourceId, targetId);
  try {
    await prisma.$transaction(async (tx) => {
      if (link.fromId === link.toId) throw new BoardError(409, "Такая связь замкнёт цикл");
      const alive = await tx.workBoardTask.findMany({
        where: { id: { in: [link.fromId, link.toId] }, deletedAt: null },
        select: { id: true },
      });
      if (alive.length !== 2) throw new BoardError(404, "Задача не найдена");
      const edges = await tx.workBoardEdge.findMany({ select: { fromId: true, toId: true } });
      if (hasSameLink(edges, link.fromId, link.toId)) throw new BoardError(409, "Такая связь уже есть");
      if (edgeWouldCycle(edges, link.fromId, link.toId)) throw new BoardError(409, "Такая связь замкнёт цикл");
      await tx.workBoardEdge.create({
        data: { fromId: link.fromId, toId: link.toId, kind, authorId: userId },
      });
      await rebalance(tx);
    });
  } catch (error) {
    if (error instanceof BoardError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new BoardError(409, "Такая связь уже есть");
    }
    throw error;
  }
  await audit({
    userId,
    action: "workboard.link",
    entity: "workboard_edge",
    details: `${kind} ${link.fromId} -> ${link.toId}`,
    ip,
  });
  return loadSnapshot();
}

export async function deleteEdge(userId: string, id: string, ip: string) {
  const edge = await prisma.workBoardEdge.findUnique({ where: { id } });
  if (!edge) throw new BoardError(404, "Связь не найдена");
  await prisma.$transaction(async (tx) => {
    await tx.workBoardEdge.delete({ where: { id } });
    await rebalance(tx);
  });
  await audit({
    userId,
    action: "workboard.unlink",
    entity: "workboard_edge",
    entityId: id,
    details: `${edge.kind} ${edge.fromId} -> ${edge.toId}`,
    ip,
  });
  return loadSnapshot();
}

export async function searchProdTasks(query: string) {
  const q = query.trim();
  const rows = await prisma.task.findMany({
    where: {
      deletedAt: null,
      ...(q
        ? {
            OR: [
              { title: { contains: q } },
              { sheetCode: { contains: q } },
              { stage: { contains: q } },
            ],
          }
        : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 12,
    select: {
      id: true,
      title: true,
      stage: true,
      status: true,
      shot: { select: { code: true } },
      scene: { select: { code: true, title: true } },
      asset: { select: { name: true } },
      episode: { select: { code: true } },
    },
  });
  return rows.map((row) => ({ id: row.id, title: taskTitle(row), status: row.status }));
}
