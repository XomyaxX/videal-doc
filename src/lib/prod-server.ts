import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { prisma } from "./prisma";
import { notify } from "./notify";
import {
  ANIM_STAGES,
  MODEL_STAGES,
  STAGE_COMPLEXITY,
  STAGE_LABEL,
  WORK_STATUSES,
  canLeadProd,
  canManageProd,
  canSeeProdTask,
  canWorkTask,
  scorePoints,
  shareRoot,
  taskDiskDir,
  toUnc,
  type ProdStatus,
} from "./prod";
import type { SessionUser } from "./types";
import type { Prisma } from "@prisma/client";
import { currentEpisodeId, taskScopeKey } from "./current-episode";
import { AI_WORK_STAGES, skillsForKindStage, userPipelineKinds } from "./prod-kinds";
import { USER_SAFE_ORG_SELECT } from "./user-public";

export const taskInclude = {
  assignee: { select: USER_SAFE_ORG_SELECT },
  shot: true,
  scene: { include: { episode: true } },
  asset: { include: { episode: true } },
  episode: true,
  files: { orderBy: { createdAt: "desc" as const }, take: 8 },
};

export function taskTitle(t: {
  title?: string | null;
  stage: string;
  shot?: { code: string } | null;
  scene?: { code: string; title: string } | null;
  asset?: { name: string } | null;
  episode?: { code: string } | null;
}) {
  if (t.title?.trim()) return t.title.trim();
  if (t.shot && t.scene) return `${t.scene.code} · ${t.shot.code}`;
  if (t.asset) return t.asset.name;
  if (t.scene) return `${t.scene.code} · ${t.scene.title}`;
  if (t.episode) return `${t.episode.code} · ${STAGE_LABEL[t.stage] || t.stage}`;
  return STAGE_LABEL[t.stage] || t.stage;
}

export function taskListWhere(
  user: SessionUser,
  scope: "mine" | "dept" | "all" = "mine",
): Prisma.TaskWhereInput {
  const work = { status: { in: [...WORK_STATUSES] }, deletedAt: null };
  if (scope === "mine" || !canLeadProd(user)) {
    return { ...work, assigneeId: user.id };
  }
  if (scope === "all" || canManageProd(user) || user.prodScope === "studio") {
    return work;
  }
  const stages =
    user.departmentName === "ИИ"
      ? [...AI_WORK_STAGES]
      : user.departmentName === "Производство"
        ? [...MODEL_STAGES]
        : [...ANIM_STAGES];
  const kinds = userPipelineKinds(user);
  return {
    ...work,
    stage: { in: stages },
    OR: [
      { assigneeId: user.id },
      { assignee: { departmentId: user.departmentId } },
      { assigneeId: null, episode: { show: { pipelineKind: { in: kinds } } } },
    ],
  };
}

export async function createProdTask(opts: {
  user: SessionUser;
  kind: "shot" | "scene" | "asset" | "episode" | "job";
  stage: string;
  title?: string;
  episodeId?: string;
  sceneId?: string;
  shotId?: string;
  assetId?: string;
  newShotCode?: string;
  newAssetName?: string;
  newAssetKind?: string;
  assigneeId?: string | null;
  startsAt?: Date | null;
  dueAt?: Date | null;
  comment?: string;
  complexity?: number;
  silent?: boolean;
  sheetCode?: string;
  skillIds?: string[];
  skillCodes?: string[];
}) {
  if (!STAGE_LABEL[opts.stage]) throw new Error("Неизвестный этап");
  assertLead(opts.user, opts.stage, null);

  if (opts.startsAt && opts.dueAt && opts.startsAt > opts.dueAt) {
    throw new Error("Окончание не может быть раньше начала");
  }

  let sceneId = opts.sceneId || null;
  let shotId = opts.shotId || null;
  let assetId = opts.assetId || null;
  let episodeId = opts.episodeId || null;
  let episodeCode = "";
  let sceneCode = "SC01";
  let shotCode: string | null = null;
  let assetPath: string | null = null;
  let assetKind: string | undefined;

  if (opts.kind === "shot") {
    if (opts.newShotCode && opts.sceneId) {
      const scene = await prisma.scene.findUnique({
        where: { id: opts.sceneId },
        include: { episode: true, shots: true },
      });
      if (!scene) throw new Error("Нет сцены");
      const code = opts.newShotCode.replace(/\s+/g, "_");
      const existing = scene.shots.find((s) => s.code.toLowerCase() === code.toLowerCase());
      const shot = existing
        ? existing
        : await prisma.shot.create({
            data: {
              sceneId: scene.id,
              code,
              sortOrder: scene.shots.length + 1,
              workPath: `${shareRoot()}/Data/${scene.episode.code}/${scene.code}/3D/Animation`,
            },
          });
      shotId = shot.id;
      sceneId = scene.id;
      episodeId = scene.episode.id;
      episodeCode = scene.episode.code;
      sceneCode = scene.code;
      shotCode = shot.code;
    } else if (opts.shotId) {
      const shot = await prisma.shot.findUnique({
        where: { id: opts.shotId },
        include: { scene: { include: { episode: true } } },
      });
      if (!shot) throw new Error("Нет шота");
      shotId = shot.id;
      sceneId = shot.sceneId;
      episodeId = shot.scene.episode.id;
      episodeCode = shot.scene.episode.code;
      sceneCode = shot.scene.code;
      shotCode = shot.code;
    } else {
      throw new Error("Выберите шот или укажите новый");
    }
  } else if (opts.kind === "scene") {
    if (!opts.sceneId) throw new Error("Выберите сцену");
    const scene = await prisma.scene.findUnique({
      where: { id: opts.sceneId },
      include: { episode: true },
    });
    if (!scene) throw new Error("Нет сцены");
    sceneId = scene.id;
    episodeId = scene.episode.id;
    episodeCode = scene.episode.code;
    sceneCode = scene.code;
  } else if (opts.kind === "job") {
    const title = (opts.title || "").trim();
    if (!title) throw new Error("Укажите название задачи");
    const epId = opts.episodeId || (await currentEpisodeId(opts.user));
    if (epId) {
      const episode = await prisma.episode.findUnique({ where: { id: epId } });
      if (episode) {
        episodeId = episode.id;
        episodeCode = episode.code;
      }
    }
    sceneId = null;
    shotId = null;
    assetId = null;
    sceneCode = "";
  } else if (opts.kind === "episode") {
    const epId = opts.episodeId || (await currentEpisodeId(opts.user));
    const episode = epId ? await prisma.episode.findUnique({ where: { id: epId } }) : null;
    if (!episode) throw new Error("Нет серии — выберите текущую на пайплайне");
    episodeId = episode.id;
    episodeCode = episode.code;
    sceneId = null;
    shotId = null;
    assetId = null;
    sceneCode = "";
  } else {
    if (opts.newAssetName) {
      const epId = opts.episodeId || (await currentEpisodeId(opts.user));
      const episode = epId ? await prisma.episode.findUnique({ where: { id: epId } }) : null;
      if (!episode) throw new Error("Нет серии — выберите текущую на пайплайне");
      episodeId = episode.id;
      episodeCode = episode.code;
      assetKind = opts.newAssetKind || "prop";
      const asset = await prisma.asset.create({
        data: {
          episodeId: episode.id,
          kind: assetKind,
          name: opts.newAssetName.trim(),
          groupName: "Новое",
          sortOrder: 900,
        },
      });
      assetId = asset.id;
    } else if (opts.assetId) {
      const asset = await prisma.asset.findUnique({
        where: { id: opts.assetId },
        include: { episode: true },
      });
      if (!asset) throw new Error("Нет ассета");
      assetId = asset.id;
      episodeId = asset.episode.id;
      episodeCode = asset.episode.code;
      assetPath = asset.diskPath;
      assetKind = asset.kind;
    } else {
      throw new Error("Выберите ассет или задайте имя");
    }
  }

  const scopeKey =
    opts.kind === "job" ? "" : taskScopeKey({ stage: opts.stage, shotId, assetId, sceneId, episodeId });
  const dup =
    opts.kind === "job"
      ? null
      : scopeKey
        ? await prisma.task.findFirst({ where: { scopeKey } })
        : await prisma.task.findFirst({
            where: {
              stage: opts.stage,
              sceneId: sceneId || null,
              shotId: shotId || null,
              assetId: assetId || null,
              ...(opts.kind === "episode" ? { episodeId: episodeId || null } : {}),
            },
          });
  if (dup?.deletedAt) {
    await prisma.task.update({ where: { id: dup.id }, data: { deletedAt: null } });
    await prisma.taskEvent.create({
      data: {
        taskId: dup.id,
        userId: opts.user.id,
        action: "restore",
        body: "восстановили при заведении этапа",
      },
    });
    return prisma.task.findUniqueOrThrow({ where: { id: dup.id } });
  }
  if (dup) throw new Error("Такой этап на этом объекте уже есть — откройте карточку и назначьте человека");

  const diskDir = taskDiskDir({
    stage: opts.stage,
    shotCode,
    sceneCode,
    episodeCode,
    assetPath,
  });

  let pipelineKind = "e02";
  if (episodeId) {
    const sh = await prisma.episode.findUnique({
      where: { id: episodeId },
      select: { show: { select: { pipelineKind: true } } },
    });
    pipelineKind = sh?.show.pipelineKind || "e02";
  }
  const skillCodes =
    opts.skillCodes && opts.skillCodes.length
      ? opts.skillCodes
      : skillsForKindStage(pipelineKind, opts.stage, assetKind);
  const skillRows = opts.skillIds?.length
    ? opts.skillIds.map((id) => ({ id }))
    : skillCodes.length
      ? await prisma.skill.findMany({ where: { code: { in: skillCodes } }, select: { id: true } })
      : [];

  const task = await prisma.task.create({
    data: {
      kind: opts.kind,
      stage: opts.stage,
      title: (opts.title || "").trim(),
      status: "todo",
      complexity: opts.complexity || STAGE_COMPLEXITY[opts.stage] || 3,
      comment: opts.comment || "",
      episodeId,
      sceneId,
      shotId,
      assetId,
      assigneeId: opts.assigneeId || null,
      startsAt: opts.startsAt || null,
      dueAt: opts.dueAt || null,
      diskDir,
      sheetCode: opts.sheetCode || "manual",
      scopeKey,
      skills: skillRows.length ? { create: skillRows.map((s) => ({ skillId: s.id })) } : undefined,
    },
  });
  await prisma.taskEvent.create({
    data: {
      taskId: task.id,
      userId: opts.user.id,
      action: "create",
      body: "создали задачу",
    },
  });
  if (!opts.silent && opts.assigneeId && opts.assigneeId !== opts.user.id) {
    await notify({
      userId: opts.assigneeId,
      title: "Вам назначили задачу",
      body: `${STAGE_LABEL[opts.stage]}`,
      link: `/prod/tasks/${task.id}`,
      urgency: "normal",
    });
  }
  return task;
}

export async function applyDates(opts: {
  user: SessionUser;
  taskId: string;
  startsAt: Date | null;
  dueAt: Date | null;
  note?: string;
}) {
  const task = await prisma.task.findUnique({
    where: { id: opts.taskId },
    include: { assignee: { include: { department: true } } },
  });
  if (!task) throw new Error("Задача не найдена");
  if (task.deletedAt) throw new Error("Задача удалена — сначала восстановите");
  assertLead(opts.user, task.stage, task.assignee?.department?.name);
  if (opts.startsAt && opts.dueAt && opts.startsAt > opts.dueAt) {
    throw new Error("Окончание не может быть раньше начала");
  }
  const settings = await prisma.appSettings.findUnique({ where: { id: "default" } });
  const needApproval = Boolean((settings as { prodDatesNeedApproval?: boolean } | null)?.prodDatesNeedApproval);
  const status = needApproval ? "pending" : "applied";
  await prisma.taskDateChange.create({
    data: {
      taskId: task.id,
      fromStartsAt: task.startsAt,
      fromDueAt: task.dueAt,
      toStartsAt: opts.startsAt,
      toDueAt: opts.dueAt,
      requestedById: opts.user.id,
      decidedById: needApproval ? null : opts.user.id,
      decidedAt: needApproval ? null : new Date(),
      status,
      note: opts.note || "",
    },
  });
  if (!needApproval) {
    await prisma.task.update({
      where: { id: task.id },
      data: { startsAt: opts.startsAt, dueAt: opts.dueAt },
    });
    await prisma.taskEvent.create({
      data: {
        taskId: task.id,
        userId: opts.user.id,
        action: "dates",
        body: opts.note || "изменили срок",
      },
    });
  }
  return { pending: needApproval };
}

export function assertWork(user: SessionUser, assigneeId: string | null) {
  if (!canWorkTask(user, assigneeId)) throw new Error("Нет права на эту задачу");
}

export function assertLead(
  user: SessionUser,
  stage: string,
  assigneeDept: string | null | undefined,
) {
  if (!canLeadProd(user, stage, assigneeDept)) throw new Error("Нет права руководителя");
}

const STATUS_SAFE: Record<string, string> = {
  wip: "взяли в работу",
  done: "сдали на проверку",
  approved: "утвердили",
  revise: "вернули на правки",
  blocked: "поставили ожидание",
};

export async function applyStatus(opts: {
  user: SessionUser;
  taskId: string;
  status: ProdStatus;
  comment?: string;
  assigneeId?: string | null;
  blockedReason?: string;
}) {
  const task = await prisma.task.findUnique({
    where: { id: opts.taskId },
    include: { assignee: { include: { department: true } } },
  });
  if (!task) throw new Error("Задача не найдена");
  if (task.deletedAt) throw new Error("Задача удалена — сначала восстановите");

  const lead = canLeadProd(opts.user, task.stage, task.assignee?.department?.name);
  const work = canWorkTask(opts.user, task.assigneeId);
  if (!lead && !work) throw new Error("Нет права");

  if (opts.status === "approved" || opts.status === "revise" || opts.assigneeId !== undefined) {
    if (!lead) throw new Error("Утверждать и назначать может только руководитель");
  }
  if (opts.status === "done" && task.kind !== "job") {
    const files = await prisma.taskFile.count({ where: { taskId: task.id } });
    if (files === 0 && !(opts.comment || "").trim()) {
      throw new Error("При сдаче нужен плейбласт или путь к файлу на шаре в комментарии");
    }
  }

  const next: {
    status: string;
    comment: string;
    blockedReason: string;
    assigneeId: string | null;
    assigneeLocked?: boolean;
    startsAt?: Date;
  } = {
    status: opts.status,
    comment: opts.comment ?? task.comment,
    blockedReason: opts.blockedReason ?? task.blockedReason,
    assigneeId: opts.assigneeId === undefined ? task.assigneeId : opts.assigneeId,
  };
  if (opts.assigneeId !== undefined && lead) next.assigneeLocked = true;
  if (opts.status === "wip" && !task.startsAt) next.startsAt = new Date();

  await prisma.task.update({ where: { id: task.id }, data: next });
  await prisma.taskEvent.create({
    data: {
      taskId: task.id,
      userId: opts.user.id,
      action: opts.status === task.status ? "update" : "status",
      fromStatus: task.status,
      toStatus: opts.status,
      body: opts.comment || opts.blockedReason || "",
    },
  });

  if (opts.status === "approved" && task.status !== "approved" && task.assigneeId) {
    const points = scorePoints(task.stage, task.complexity);
    if (points > 0) {
      const prev = await prisma.productionScoreEvent.findMany({
        where: { taskId: task.id, userId: task.assigneeId, reason: { in: ["approved", "unapproved"] } },
      });
      const net = prev.reduce((s, e) => s + e.points, 0);
      if (net <= 0) {
        await prisma.productionScoreEvent.create({
          data: {
            userId: task.assigneeId,
            taskId: task.id,
            points,
            reason: "approved",
          },
        });
      }
    }
  }
  if (task.status === "approved" && opts.status !== "approved" && task.assigneeId) {
    const prev = await prisma.productionScoreEvent.findFirst({
      where: { taskId: task.id, userId: task.assigneeId, reason: "approved" },
      orderBy: { createdAt: "desc" },
    });
    if (prev && prev.points > 0) {
      await prisma.productionScoreEvent.create({
        data: {
          userId: task.assigneeId,
          taskId: task.id,
          points: -prev.points,
          reason: "unapproved",
        },
      });
    }
  }

  if (task.assigneeId && task.assigneeId !== opts.user.id) {
    await notify({
      userId: task.assigneeId,
      title: `Производство: ${STATUS_SAFE[opts.status] || opts.status}`,
      body: opts.comment || "",
      link: `/prod/tasks/${task.id}`,
      urgency: "normal",
    });
  }
}

const ALLOWED_EXT = new Set([".mp4", ".webm", ".mov", ".png", ".jpg", ".jpeg", ".webp", ".pdf", ".gif"]);

export async function saveProdFile(opts: {
  user: SessionUser;
  taskId: string;
  buffer: Buffer;
  originalName: string;
  mime: string;
  maxBytes: number;
  kind: string;
}) {
  const task = await prisma.task.findUnique({
    where: { id: opts.taskId },
    include: {
      assignee: { include: { department: true } },
      shot: true,
      scene: { include: { episode: true } },
      asset: true,
    },
  });
  if (!task) throw new Error("Задача не найдена");
  if (task.deletedAt) throw new Error("Задача удалена — сначала восстановите");
  if (!canWorkTask(opts.user, task.assigneeId) && !canLeadProd(opts.user, task.stage, task.assignee?.department?.name)) {
    throw new Error("Нет права прикреплять файл");
  }
  if (opts.buffer.length > opts.maxBytes) throw new Error("Файл слишком большой");
  const ext = path.extname(opts.originalName).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) throw new Error("Для отчёта нужны mp4, png, jpg или pdf — blend кладём ссылкой");
  const dir = task.diskDir || `${shareRoot()}/Data`;
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const login = opts.user.login.replace(/[^a-z0-9._-]/gi, "_");
  const base = `${stamp}_${login}_v${Date.now().toString().slice(-4)}${ext}`;
  const abs = path.join(dir, base);
  await writeFile(abs, opts.buffer);
  const rec = await prisma.taskFile.create({
    data: {
      taskId: task.id,
      originalName: path.basename(opts.originalName).slice(0, 200),
      mimeType: opts.mime || "application/octet-stream",
      size: opts.buffer.length,
      absPath: abs,
      uncPath: toUnc(abs),
      kind: opts.kind || "playblast",
      uploadedById: opts.user.id,
    },
  });
  await prisma.taskEvent.create({
    data: {
      taskId: task.id,
      userId: opts.user.id,
      action: "file",
      body: rec.originalName,
    },
  });
  return rec;
}

export function canSeeScores(user: SessionUser) {
  return canManageProd(user) || canLeadProd(user);
}

export async function hideProdTask(opts: { user: SessionUser; taskId: string }) {
  const task = await prisma.task.findUnique({
    where: { id: opts.taskId },
    include: { assignee: { include: { department: true } } },
  });
  if (!task) throw new Error("Задача не найдена");
  assertLead(opts.user, task.stage, task.assignee?.department?.name);
  if (task.deletedAt) throw new Error("Уже удалена");
  await prisma.task.update({ where: { id: task.id }, data: { deletedAt: new Date() } });
  await prisma.taskEvent.create({
    data: { taskId: task.id, userId: opts.user.id, action: "hide", body: "убрали задачу" },
  });
  if (task.assigneeId && task.assigneeId !== opts.user.id) {
    await notify({
      userId: task.assigneeId,
      title: "Задачу убрали",
      body: STAGE_LABEL[task.stage] || task.stage,
      link: `/prod/tasks/${task.id}`,
      urgency: "normal",
    });
  }
}

export async function restoreProdTask(opts: { user: SessionUser; taskId: string }) {
  const task = await prisma.task.findUnique({
    where: { id: opts.taskId },
    include: { assignee: { include: { department: true } } },
  });
  if (!task) throw new Error("Задача не найдена");
  assertLead(opts.user, task.stage, task.assignee?.department?.name);
  if (!task.deletedAt) throw new Error("Задача и так на месте");
  await prisma.task.update({ where: { id: task.id }, data: { deletedAt: null } });
  await prisma.taskEvent.create({
    data: { taskId: task.id, userId: opts.user.id, action: "restore", body: "восстановили задачу" },
  });
  if (task.assigneeId && task.assigneeId !== opts.user.id) {
    await notify({
      userId: task.assigneeId,
      title: "Задачу вернули",
      body: STAGE_LABEL[task.stage] || task.stage,
      link: `/prod/tasks/${task.id}`,
      urgency: "normal",
    });
  }
}

export async function addTaskComment(opts: { user: SessionUser; taskId: string; body: string }) {
  const text = opts.body.trim().slice(0, 4000);
  if (!text) throw new Error("Напишите комментарий");
  const task = await prisma.task.findUnique({
    where: { id: opts.taskId },
    include: { assignee: { include: { department: true } } },
  });
  if (!task) throw new Error("Нет задачи");
  if (task.deletedAt) throw new Error("Задача удалена — сначала восстановите");
  if (!canSeeProdTask(opts.user, task)) throw new Error("Нет права");
  const lead = canLeadProd(opts.user, task.stage, task.assignee?.department?.name);
  if (!canWorkTask(opts.user, task.assigneeId) && !lead) {
    throw new Error("Нет права комментировать");
  }
  const row = await prisma.taskEvent.create({
    data: {
      taskId: task.id,
      userId: opts.user.id,
      action: "comment",
      body: text,
    },
  });
  if (task.assigneeId && task.assigneeId !== opts.user.id) {
    await notify({
      userId: task.assigneeId,
      title: "Комментарий к задаче",
      body: text.slice(0, 160),
      link: `/prod/tasks/${task.id}`,
      urgency: "normal",
    });
  }
  return row;
}
