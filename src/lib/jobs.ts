import { createHash, randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { prisma } from "./prisma";
import { assertInside, fileRoot, safeFilePart } from "./files";
import { canLeadProd, canManageProd, shareRoot, toUnc, WORK_STATUSES, STAGE_WEIGHT } from "./prod";
import { skillsForE02Stage } from "./pipeline";
import { fullName } from "./names";
import { previewMode } from "./library-kinds";
import { notify } from "./notify";
import { officeTodayNoon } from "./dates";
import type { SessionUser } from "./types";
import { USER_SAFE_SELECT } from "./user-public";

const BLOCKED = new Set([".exe", ".bat", ".cmd", ".com", ".msi", ".dll", ".sh", ".ps1", ".js", ".vbs", ".scr"]);
const OPEN_STATUSES = ["todo", "wip", "revise", "blocked"];

function safePart(name: string) {
  return safeFilePart(name);
}

const STATUS_FRAC: Record<string, number> = {
  todo: 0,
  blocked: 0,
  wip: 0.35,
  revise: 0.5,
  done: 0.8,
  approved: 1,
};

export function jobProgress(tasks: { stage: string; status: string; complexity: number }[]) {
  let weight = 0;
  let done = 0;
  for (const t of tasks) {
    if (t.status === "na") continue;
    const w = (STAGE_WEIGHT[t.stage] ?? 1) * Math.max(1, t.complexity || 3);
    weight += w;
    done += w * (STATUS_FRAC[t.status] ?? 0);
  }
  const pct = weight <= 0 ? 0 : Math.round((100 * done) / weight);
  return { pct, total: tasks.length, open: tasks.filter((t) => OPEN_STATUSES.includes(t.status)).length };
}

function jobBlocked(job: { status: string; deletedAt?: Date | null } | null) {
  return !job || job.status === "archived" || Boolean(job.deletedAt);
}

function assertJobOpen<T extends { status: string; deletedAt?: Date | null }>(job: T | null): asserts job is T {
  if (jobBlocked(job)) throw new Error("Нет задачи");
}

export async function canSeeJob(user: SessionUser, jobId: string) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { deletedAt: true, status: true } });
  if (!job) return false;
  if (canManageProd(user) || canLeadProd(user)) return true;
  if (job.deletedAt) return false;
  const [member, assigned] = await Promise.all([
    prisma.jobMember.findUnique({ where: { jobId_userId: { jobId, userId: user.id } } }),
    prisma.task.findFirst({ where: { jobId, assigneeId: user.id, deletedAt: null }, select: { id: true } }),
  ]);
  return Boolean(member || assigned);
}

export async function canWriteJob(user: SessionUser, jobId: string) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { deletedAt: true, status: true } });
  if (jobBlocked(job)) return false;
  if (canManageProd(user) || canLeadProd(user)) return true;
  const member = await prisma.jobMember.findUnique({
    where: { jobId_userId: { jobId, userId: user.id } },
  });
  return Boolean(member);
}

export function jobListWhere(user: SessionUser) {
  const alive = { deletedAt: null };
  if (canManageProd(user) || canLeadProd(user)) return alive;
  return {
    ...alive,
    OR: [{ members: { some: { userId: user.id } } }, { tasks: { some: { assigneeId: user.id } } }, { authorId: user.id }],
  };
}

async function ensureJobDir(title: string) {
  const year = new Date().toISOString().slice(0, 4);
  const dir = path.join(shareRoot(), "Jobs", year, `${safePart(title)}_${Date.now().toString(36)}`);
  await mkdir(/* turbopackIgnore: true */ dir, { recursive: true });
  await mkdir(/* turbopackIgnore: true */ path.join(dir, "chat"), { recursive: true });
  return dir;
}

export async function createJob(opts: {
  user: SessionUser;
  title: string;
  description: string;
  episodeId?: string | null;
  startsAt?: Date | null;
  dueAt?: Date | null;
  memberIds: string[];
}) {
  if (!canLeadProd(opts.user)) throw new Error("Нет права руководителя");
  const title = opts.title.trim();
  if (!title) throw new Error("Укажите название");
  if (opts.startsAt && opts.dueAt && opts.startsAt > opts.dueAt) {
    throw new Error("Окончание не может быть раньше начала");
  }
  const diskDir = await ensureJobDir(title);
  const memberIds = Array.from(new Set([opts.user.id, ...opts.memberIds.map(String).filter(Boolean)]));
  const people = await prisma.user.findMany({
    where: { id: { in: memberIds }, deletedAt: null, status: "active" },
    select: { id: true },
  });
  const ok = new Set(people.map((p) => p.id));
  return prisma.job.create({
    data: {
      title: title.slice(0, 200),
      description: opts.description.trim().slice(0, 4000),
      episodeId: opts.episodeId || null,
      startsAt: opts.startsAt || officeTodayNoon(),
      dueAt: opts.dueAt || null,
      diskDir,
      uncPath: toUnc(diskDir),
      authorId: opts.user.id,
      members: { create: [...ok].map((userId) => ({ userId })) },
    },
    include: { members: { include: { user: { select: USER_SAFE_SELECT } } }, episode: true },
  });
}

export async function setJobMembers(opts: { user: SessionUser; jobId: string; memberIds: string[] }) {
  if (!canLeadProd(opts.user)) throw new Error("Нет права руководителя");
  const job = await prisma.job.findUnique({ where: { id: opts.jobId } });
  assertJobOpen(job);
  const ids = Array.from(new Set([job.authorId, ...opts.memberIds.map(String).filter(Boolean)]));
  const people = await prisma.user.findMany({
    where: { id: { in: ids }, deletedAt: null, status: "active" },
    select: { id: true },
  });
  const ok = people.map((p) => p.id);
  await prisma.jobMember.deleteMany({ where: { jobId: opts.jobId, userId: { notIn: ok } } });
  for (const userId of ok) {
    await prisma.jobMember.upsert({
      where: { jobId_userId: { jobId: opts.jobId, userId } },
      create: { jobId: opts.jobId, userId },
      update: {},
    });
  }
}

export async function createJobTask(opts: {
  user: SessionUser;
  jobId: string;
  title: string;
  complexity: number;
  skillIds: string[];
  dueAt?: Date | null;
  comment?: string;
  assigneeId?: string | null;
}) {
  if (!canLeadProd(opts.user)) throw new Error("Нет права руководителя");
  const job = await prisma.job.findUnique({ where: { id: opts.jobId } });
  assertJobOpen(job);
  const title = opts.title.trim();
  if (!title) throw new Error("Укажите название подзадачи");
  const complexity = Math.max(1, Math.min(5, Math.round(opts.complexity || 3)));
  const skillIds = Array.from(new Set(opts.skillIds.map(String).filter(Boolean)));
  const skills = skillIds.length
    ? await prisma.skill.findMany({ where: { id: { in: skillIds } }, select: { id: true } })
    : [];
  const assigneeId = opts.assigneeId ? String(opts.assigneeId) : "";
  if (assigneeId) {
    const person = await prisma.user.findFirst({
      where: { id: assigneeId, deletedAt: null, status: "active" },
      select: { id: true },
    });
    if (!person) throw new Error("Нет такого сотрудника");
  }
  const task = await prisma.task.create({
    data: {
      kind: "job",
      stage: "task",
      status: "todo",
      title: title.slice(0, 200),
      complexity,
      comment: (opts.comment || "").slice(0, 2000),
      jobId: job.id,
      startsAt: officeTodayNoon(),
      dueAt: opts.dueAt || job.dueAt,
      diskDir: job.diskDir,
      sheetCode: "job",
      scopeKey: "",
      assigneeId: assigneeId || null,
      assigneeLocked: Boolean(assigneeId),
      skills: skills.length ? { create: skills.map((s) => ({ skillId: s.id })) } : undefined,
    },
  });
  await prisma.taskEvent.create({
    data: {
      taskId: task.id,
      userId: opts.user.id,
      action: "create",
      body: assigneeId ? "подзадача крупной, назначили вручную" : "подзадача крупной",
    },
  });
  if (assigneeId) {
    await prisma.jobMember.upsert({
      where: { jobId_userId: { jobId: job.id, userId: assigneeId } },
      create: { jobId: job.id, userId: assigneeId },
      update: {},
    });
    if (assigneeId !== opts.user.id) {
      await notify({
        userId: assigneeId,
        title: "Новая подзадача",
        body: title.slice(0, 200),
        link: `/prod/tasks/${task.id}`,
        urgency: "normal",
      });
    }
  }
  return task;
}

function neededSkills(task: {
  kind: string;
  stage: string;
  asset?: { kind: string } | null;
  skills: { skill: { code: string } }[];
}) {
  if (task.skills.length) return task.skills.map((s) => s.skill.code);
  return skillsForE02Stage(task.stage, task.asset?.kind);
}

export async function assignJobBySkills(opts: { user: SessionUser; jobId: string }) {
  if (!canLeadProd(opts.user)) throw new Error("Нет права руководителя");
  const job = await prisma.job.findUnique({
    where: { id: opts.jobId },
    include: {
      members: { include: { user: { include: { skills: { include: { skill: true } } } } } },
      tasks: {
        where: { status: "todo", assigneeLocked: false, deletedAt: null },
        include: { skills: { include: { skill: true } }, asset: true },
      },
    },
  });
  assertJobOpen(job);
  const team = job.members
    .filter((m) => m.user.deletedAt === null && m.user.status === "active")
    .map((m) => ({
      id: m.user.id,
      name: fullName(m.user),
      skills: new Set(m.user.skills.map((s) => s.skill.code)),
    }));
  if (team.length === 0) throw new Error("Сначала закрепите сотрудников");

  const loads = await prisma.task.groupBy({
    by: ["assigneeId"],
    where: {
      assigneeId: { in: team.map((t) => t.id) },
      status: { in: [...WORK_STATUSES] },
      deletedAt: null,
    },
    _sum: { complexity: true },
    _count: { _all: true },
  });
  const loadMap = new Map(team.map((t) => [t.id, { complexity: 0, count: 0, name: t.name }]));
  for (const row of loads) {
    if (!row.assigneeId) continue;
    const cur = loadMap.get(row.assigneeId);
    if (cur) {
      cur.complexity = row._sum.complexity || 0;
      cur.count = row._count._all;
    }
  }

  const placed: { taskId: string; title: string; userId: string; name: string }[] = [];
  const skipped: { taskId: string; title: string; reason: string }[] = [];

  const sorted = [...job.tasks].sort((a, b) => b.complexity - a.complexity || a.title.localeCompare(b.title, "ru"));
  for (const task of sorted) {
    const need = neededSkills(task);
    const candidates = team.filter((p) => need.length === 0 || need.some((s) => p.skills.has(s)));
    if (candidates.length === 0) {
      skipped.push({ taskId: task.id, title: task.title || task.stage, reason: "нет человека с нужным скилом" });
      continue;
    }
    candidates.sort((a, b) => {
      const la = loadMap.get(a.id)!;
      const lb = loadMap.get(b.id)!;
      if (la.complexity !== lb.complexity) return la.complexity - lb.complexity;
      if (la.count !== lb.count) return la.count - lb.count;
      return a.name.localeCompare(b.name, "ru");
    });
    const pick = candidates[0];
    await prisma.task.update({
      where: { id: task.id },
      data: { assigneeId: pick.id, assigneeLocked: false },
    });
    const load = loadMap.get(pick.id)!;
    load.complexity += task.complexity;
    load.count += 1;
    placed.push({ taskId: task.id, title: task.title || task.stage, userId: pick.id, name: pick.name });
  }

  return { placed, skipped };
}

async function storeWebFile(opts: { buffer: Buffer; originalName: string; mimeType: string; userId: string }) {
  const id = randomUUID();
  const ext = path.extname(opts.originalName).toLowerCase() || "";
  const rel = `${id}${ext}`;
  const dir = fileRoot();
  await mkdir(/* turbopackIgnore: true */ dir, { recursive: true });
  const abs = path.join(/* turbopackIgnore: true */ dir, rel);
  await writeFile(/* turbopackIgnore: true */ abs, opts.buffer);
  const sha256 = createHash("sha256").update(opts.buffer).digest("hex");
  return prisma.storedFile.create({
    data: {
      id,
      originalName: path.basename(opts.originalName).slice(0, 200),
      mimeType: opts.mimeType || "application/octet-stream",
      size: opts.buffer.length,
      path: rel,
      sha256,
      createdById: opts.userId,
    },
  });
}

async function copyJobFile(dir: string, originalName: string, buffer: Buffer) {
  const ext = path.extname(originalName).toLowerCase() || "";
  const stem = safePart(path.basename(originalName, ext));
  let name = `${stem}${ext}`;
  let abs = path.join(/* turbopackIgnore: true */ dir, name);
  let n = 2;
  while (true) {
    try {
      await writeFile(/* turbopackIgnore: true */ abs, buffer, { flag: "wx" });
      return abs;
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code !== "EEXIST") throw e;
      name = `${stem}_${n}${ext}`;
      abs = path.join(/* turbopackIgnore: true */ dir, name);
      n += 1;
    }
  }
}

type Incoming = { buffer: Buffer; originalName: string; mime: string };

export async function postJobMessage(opts: {
  user: SessionUser;
  jobId: string;
  body: string;
  files: Incoming[];
  maxBytes: number;
}) {
  if (!(await canWriteJob(opts.user, opts.jobId))) throw new Error("Нет права писать в чат");
  const job = await prisma.job.findUnique({ where: { id: opts.jobId } });
  assertJobOpen(job);
  const body = opts.body.trim().slice(0, 4000);
  const incoming = opts.files.filter((f) => f.buffer.length > 0);
  if (!body && incoming.length === 0) throw new Error("Напишите текст или приложите файл");

  const chatDir = path.join(/* turbopackIgnore: true */ job.diskDir || (await ensureJobDir(job.title)), "chat");
  await mkdir(/* turbopackIgnore: true */ chatDir, { recursive: true });

  const saved: {
    originalName: string;
    mimeType: string;
    size: number;
    fileId: string;
    absPath: string;
    uncPath: string;
    uploadedById: string;
  }[] = [];

  for (const file of incoming) {
    if (file.buffer.length > opts.maxBytes) throw new Error(`Слишком большой: ${file.originalName}`);
    const ext = path.extname(file.originalName).toLowerCase();
    if (BLOCKED.has(ext)) throw new Error(`Этот тип нельзя: ${file.originalName}`);
    const mime = file.mime || "application/octet-stream";
    const absPath = await copyJobFile(chatDir, file.originalName, file.buffer);
    let fileId = "";
    const preview = previewMode({ mimeType: mime, originalName: file.originalName });
    const keepWeb = file.buffer.length <= 80 * 1024 * 1024 || preview !== "none";
    if (keepWeb) {
      const rec = await storeWebFile({
        buffer: file.buffer,
        originalName: file.originalName,
        mimeType: mime,
        userId: opts.user.id,
      });
      fileId = rec.id;
    }
    saved.push({
      originalName: path.basename(file.originalName).slice(0, 200),
      mimeType: mime,
      size: file.buffer.length,
      fileId,
      absPath,
      uncPath: toUnc(absPath),
      uploadedById: opts.user.id,
    });
  }

  return prisma.jobMessage.create({
    data: {
      jobId: opts.jobId,
      authorId: opts.user.id,
      body,
      files: saved.length ? { create: saved } : undefined,
    },
    include: {
      author: { select: { lastName: true, firstName: true, middleName: true } },
      files: true,
    },
  });
}

export function serializeJobFile(jobId: string, f: {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  uncPath: string;
}) {
  const preview = previewMode(f);
  return {
    id: f.id,
    originalName: f.originalName,
    mimeType: f.mimeType,
    size: f.size,
    uncPath: f.uncPath,
    preview,
    fileUrl: `/api/prod/jobs/${jobId}/file/${f.id}`,
    thumbUrl: preview === "image" ? `/api/prod/jobs/${jobId}/file/${f.id}` : "",
  };
}

export async function hideJob(opts: { user: SessionUser; jobId: string }) {
  if (!canLeadProd(opts.user)) throw new Error("Нет права руководителя");
  const job = await prisma.job.findUnique({
    where: { id: opts.jobId },
    include: { members: { select: { userId: true } } },
  });
  if (!job) throw new Error("Нет задачи");
  if (job.deletedAt) throw new Error("Уже удалена");
  await prisma.job.update({ where: { id: job.id }, data: { deletedAt: new Date() } });
  const others = job.members.map((m) => m.userId).filter((id) => id !== opts.user.id);
  await Promise.all(
    others.map((userId) =>
      notify({
        userId,
        title: "Крупную задачу убрали",
        body: job.title,
        link: `/prod/jobs/${job.id}`,
        urgency: "normal",
      }),
    ),
  );
}

export async function restoreJob(opts: { user: SessionUser; jobId: string }) {
  if (!canLeadProd(opts.user)) throw new Error("Нет права руководителя");
  const job = await prisma.job.findUnique({
    where: { id: opts.jobId },
    include: { members: { select: { userId: true } } },
  });
  if (!job) throw new Error("Нет задачи");
  if (!job.deletedAt) throw new Error("Задача и так на месте");
  await prisma.job.update({ where: { id: job.id }, data: { deletedAt: null } });
  const others = job.members.map((m) => m.userId).filter((id) => id !== opts.user.id);
  await Promise.all(
    others.map((userId) =>
      notify({
        userId,
        title: "Крупную задачу вернули",
        body: job.title,
        link: `/prod/jobs/${job.id}`,
        urgency: "normal",
      }),
    ),
  );
}
