import { prisma } from "./prisma";
import { createProdTask } from "./prod-server";
import { STAGE_LABEL, canLeadProd, shareRoot, stagesForAssetKind } from "./prod";
import { specForKind, skillsForKindStage } from "./prod-kinds";
import { notify } from "./notify";
import { taskScopeKey } from "./current-episode";
import type { SessionUser } from "./types";

const MAX_SHOTS = 40;
const MAX_SCENES = 80;

function nextSceneCode(codes: string[]) {
  const nums = codes.map((c) => {
    const m = c.match(/^SC(\d+)$/i);
    return m ? Number(m[1]) : 0;
  });
  const n = Math.max(0, ...nums) + 1;
  return `SC${String(n).padStart(2, "0")}`;
}

function nextShotCodes(existing: string[], count: number) {
  const nums = existing.map((c) => {
    const m = c.match(/(\d+)\s*$/);
    return m ? Number(m[1]) : 0;
  });
  let n = Math.max(0, ...nums);
  return Array.from({ length: count }, () => {
    n += 1;
    return `Shot_${String(n).padStart(2, "0")}`;
  });
}

function clampCount(n: number, max: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(max, Math.round(n)));
}

function assertLead(user: SessionUser) {
  if (!canLeadProd(user)) throw new Error("Нет права руководителя");
}

async function loadSkillIndex() {
  const users = await prisma.user.findMany({
    where: { deletedAt: null, status: "active" },
    select: { id: true, skills: { select: { skill: { select: { code: true } } } } },
  });
  const byCode = new Map<string, string[]>();
  for (const u of users) {
    for (const s of u.skills) {
      const list = byCode.get(s.skill.code) || [];
      list.push(u.id);
      byCode.set(s.skill.code, list);
    }
  }
  return byCode;
}

function uniqueAssignee(index: Map<string, string[]>, codes: string[]) {
  const ids = new Set<string>();
  for (const c of codes) {
    for (const id of index.get(c) || []) ids.add(id);
  }
  return ids.size === 1 ? [...ids][0] : null;
}

export async function createEpisode(opts: {
  user: SessionUser;
  showId?: string;
  showName?: string;
  code: string;
  name: string;
}) {
  assertLead(opts.user);
  const code = opts.code.trim().toUpperCase().replace(/\s+/g, "");
  const name = opts.name.trim();
  if (!code) throw new Error("Укажите код серии, например E03");
  if (!name) throw new Error("Укажите название серии");
  if (code.length > 12) throw new Error("Код серии слишком длинный");

  let showId = opts.showId || "";
  if (showId) {
    const show = await prisma.show.findUnique({ where: { id: showId } });
    if (!show) throw new Error("Нет такого проекта");
  } else {
    const showName = (opts.showName || "").trim() || "Видеаль";
    const existing = await prisma.show.findFirst({ orderBy: { createdAt: "asc" } });
    const show =
      existing ||
      (await prisma.show.create({
        data: { code: "VID", name: showName },
      }));
    showId = show.id;
  }

  const dup = await prisma.episode.findFirst({ where: { showId, code } });
  if (dup) throw new Error("Серия с таким кодом уже есть");

  const episode = await prisma.episode.create({
    data: {
      showId,
      code,
      name: name.slice(0, 200),
      diskPath: `${shareRoot()}/Data/${code}`,
    },
  });
  await prisma.user.update({
    where: { id: opts.user.id },
    data: { currentEpisodeId: episode.id },
  });
  return episode;
}

export async function createScene(opts: {
  user: SessionUser;
  episodeId: string;
  title: string;
  locationNote?: string;
  charactersNote?: string;
  shotCount?: number;
  spawn?: boolean;
}) {
  assertLead(opts.user);
  const episode = await prisma.episode.findUnique({
    where: { id: opts.episodeId },
    include: { scenes: { select: { code: true, sortOrder: true } } },
  });
  if (!episode) throw new Error("Нет серии");
  if (episode.scenes.length >= MAX_SCENES) throw new Error("Слишком много сцен в серии");
  const title = opts.title.trim();
  if (!title) throw new Error("Назовите сцену — коротко, как в сценарии");

  const code = nextSceneCode(episode.scenes.map((s) => s.code));
  const sortOrder = Math.max(0, ...episode.scenes.map((s) => s.sortOrder)) + 1;
  const shotCount = clampCount(opts.shotCount ?? 6, MAX_SHOTS);
  const scene = await prisma.scene.create({
    data: {
      episodeId: episode.id,
      code,
      title: title.slice(0, 200),
      locationNote: (opts.locationNote || "").trim().slice(0, 400),
      charactersNote: (opts.charactersNote || "").trim().slice(0, 400),
      diskPath: `${shareRoot()}/Data/${episode.code}/${code}`,
      sortOrder,
    },
  });
  const shots = await addShotsToScene({
    sceneId: scene.id,
    episodeCode: episode.code,
    sceneCode: code,
    existingCodes: [],
    count: shotCount,
  });
  let spawned = 0;
  if (opts.spawn) {
    const result = await spawnBreakdown({
      user: opts.user,
      episodeId: episode.id,
      sceneId: scene.id,
      includePreprod: false,
      includeScenes: true,
      includeShots: true,
      includeAssets: false,
    });
    spawned = result.created;
  }
  return { scene, shots, spawned };
}

async function addShotsToScene(opts: {
  sceneId: string;
  episodeCode: string;
  sceneCode: string;
  existingCodes: string[];
  count: number;
}) {
  const count = clampCount(opts.count, MAX_SHOTS);
  if (count <= 0) return [];
  const codes = nextShotCodes(opts.existingCodes, count);
  const created = [];
  for (let i = 0; i < codes.length; i++) {
    const shot = await prisma.shot.create({
      data: {
        sceneId: opts.sceneId,
        code: codes[i],
        sortOrder: opts.existingCodes.length + i + 1,
        workPath: `${shareRoot()}/Data/${opts.episodeCode}/${opts.sceneCode}/3D/Animation`,
      },
    });
    created.push(shot);
  }
  return created;
}

export async function addShots(opts: {
  user: SessionUser;
  sceneId: string;
  count: number;
  spawn?: boolean;
}) {
  assertLead(opts.user);
  const scene = await prisma.scene.findUnique({
    where: { id: opts.sceneId },
    include: { episode: true, shots: { select: { code: true } } },
  });
  if (!scene) throw new Error("Нет сцены");
  const room = MAX_SHOTS - scene.shots.length;
  const count = clampCount(opts.count, Math.max(0, room));
  if (count <= 0) throw new Error("В сцене уже максимум шотов");
  const shots = await addShotsToScene({
    sceneId: scene.id,
    episodeCode: scene.episode.code,
    sceneCode: scene.code,
    existingCodes: scene.shots.map((s) => s.code),
    count,
  });
  let spawned = 0;
  if (opts.spawn) {
    const result = await spawnBreakdown({
      user: opts.user,
      episodeId: scene.episodeId,
      sceneId: scene.id,
      includePreprod: false,
      includeScenes: false,
      includeShots: true,
      includeAssets: false,
      onlyNewShotIds: shots.map((s) => s.id),
    });
    spawned = result.created;
  }
  return { shots, spawned };
}

export async function createAssetRow(opts: {
  user: SessionUser;
  episodeId: string;
  kind: string;
  name: string;
  spawn?: boolean;
}) {
  assertLead(opts.user);
  const episode = await prisma.episode.findUnique({ where: { id: opts.episodeId } });
  if (!episode) throw new Error("Нет серии");
  const name = opts.name.trim();
  if (!name) throw new Error("Назовите персонажа, локацию или проп");
  const kind = opts.kind === "character" || opts.kind === "location" ? opts.kind : "prop";
  const last = await prisma.asset.findFirst({
    where: { episodeId: episode.id },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const asset = await prisma.asset.create({
    data: {
      episodeId: episode.id,
      kind,
      name: name.slice(0, 200),
      groupName: kind === "character" ? "Персонажи" : kind === "location" ? "Локации" : "Пропы",
      sortOrder: (last?.sortOrder || 0) + 1,
    },
  });
  let spawned = 0;
  if (opts.spawn) {
    const result = await spawnBreakdown({
      user: opts.user,
      episodeId: episode.id,
      assetId: asset.id,
      includePreprod: false,
      includeScenes: false,
      includeShots: false,
      includeAssets: true,
    });
    spawned = result.created;
  }
  return { asset, spawned };
}

export async function patchAssetKind(opts: {
  user: SessionUser;
  assetId: string;
  kind: string;
}) {
  assertLead(opts.user);
  const kind = opts.kind === "character" || opts.kind === "location" ? opts.kind : "prop";
  const asset = await prisma.asset.findUnique({ where: { id: opts.assetId } });
  if (!asset) throw new Error("Нет ассета");
  return prisma.asset.update({ where: { id: asset.id }, data: { kind } });
}

async function writeOrder(table: "scene" | "shot" | "asset", rows: { id: string }[]) {
  await prisma.$transaction(
    rows.map((row, i) => {
      const data = { sortOrder: i + 1 };
      if (table === "scene") return prisma.scene.update({ where: { id: row.id }, data });
      if (table === "shot") return prisma.shot.update({ where: { id: row.id }, data });
      return prisma.asset.update({ where: { id: row.id }, data });
    }),
  );
}

function moveRow<T extends { id: string }>(rows: T[], id: string, to: number) {
  const from = rows.findIndex((r) => r.id === id);
  if (from < 0) throw new Error("Нет такой плитки");
  const target = Math.max(0, Math.min(rows.length - 1, Math.round(to) - 1));
  if (from === target) return rows;
  const next = [...rows];
  const [item] = next.splice(from, 1);
  next.splice(target, 0, item);
  return next;
}

export async function reorderBreakdown(opts: {
  user: SessionUser;
  target: string;
  id: string;
  to: number;
}) {
  assertLead(opts.user);
  const to = Number(opts.to);
  if (!Number.isFinite(to)) throw new Error("Укажите номер");
  if (opts.target === "scene") {
    const scene = await prisma.scene.findUnique({ where: { id: opts.id } });
    if (!scene) throw new Error("Нет сцены");
    const rows = await prisma.scene.findMany({
      where: { episodeId: scene.episodeId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true },
    });
    await writeOrder("scene", moveRow(rows, opts.id, to));
    return { ok: true };
  }
  if (opts.target === "shot") {
    const shot = await prisma.shot.findUnique({ where: { id: opts.id } });
    if (!shot) throw new Error("Нет шота");
    const rows = await prisma.shot.findMany({
      where: { sceneId: shot.sceneId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true },
    });
    await writeOrder("shot", moveRow(rows, opts.id, to));
    return { ok: true };
  }
  if (opts.target === "asset") {
    const asset = await prisma.asset.findUnique({ where: { id: opts.id } });
    if (!asset) throw new Error("Нет ассета");
    const rows = await prisma.asset.findMany({
      where: { episodeId: asset.episodeId, kind: asset.kind },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true },
    });
    await writeOrder("asset", moveRow(rows, opts.id, to));
    return { ok: true };
  }
  throw new Error("Нечего переставлять");
}

export async function removeAsset(opts: { user: SessionUser; assetId: string }) {
  assertLead(opts.user);
  const asset = await prisma.asset.findUnique({ where: { id: opts.assetId }, select: { id: true } });
  if (!asset) throw new Error("Нет ассета");
  await prisma.asset.delete({ where: { id: asset.id } });
  return { ok: true };
}

export async function patchScene(opts: {
  user: SessionUser;
  sceneId: string;
  title?: string;
  locationNote?: string;
  charactersNote?: string;
}) {
  assertLead(opts.user);
  const scene = await prisma.scene.findUnique({ where: { id: opts.sceneId } });
  if (!scene) throw new Error("Нет сцены");
  const data: { title?: string; locationNote?: string; charactersNote?: string } = {};
  if (opts.title !== undefined) {
    const title = opts.title.trim();
    if (!title) throw new Error("Название сцены не может быть пустым");
    data.title = title.slice(0, 200);
  }
  if (opts.locationNote !== undefined) data.locationNote = opts.locationNote.trim().slice(0, 400);
  if (opts.charactersNote !== undefined) data.charactersNote = opts.charactersNote.trim().slice(0, 400);
  return prisma.scene.update({ where: { id: scene.id }, data });
}

export async function patchShot(opts: {
  user: SessionUser;
  shotId: string;
  location?: string;
  description?: string;
}) {
  assertLead(opts.user);
  const shot = await prisma.shot.findUnique({ where: { id: opts.shotId } });
  if (!shot) throw new Error("Нет шота");
  return prisma.shot.update({
    where: { id: shot.id },
    data: {
      location: opts.location !== undefined ? opts.location.trim().slice(0, 200) : undefined,
      description: opts.description !== undefined ? opts.description.trim().slice(0, 800) : undefined,
    },
  });
}

export async function removeEmptyShot(opts: { user: SessionUser; shotId: string }) {
  assertLead(opts.user);
  const shot = await prisma.shot.findUnique({ where: { id: opts.shotId }, select: { id: true } });
  if (!shot) throw new Error("Нет шота");
  await prisma.shot.delete({ where: { id: shot.id } });
  return { ok: true };
}

export async function removeEmptyScene(opts: { user: SessionUser; sceneId: string }) {
  assertLead(opts.user);
  const scene = await prisma.scene.findUnique({ where: { id: opts.sceneId }, select: { id: true } });
  if (!scene) throw new Error("Нет сцены");
  await prisma.scene.delete({ where: { id: scene.id } });
  return { ok: true };
}

type SpawnPlanItem = {
  kind: "episode" | "scene" | "shot" | "asset";
  stage: string;
  label: string;
  episodeId: string;
  sceneId?: string;
  shotId?: string;
  assetId?: string;
  assetKind?: string;
  scopeKey: string;
};

export async function planSpawn(opts: {
  episodeId: string;
  sceneId?: string;
  shotId?: string;
  assetId?: string;
  includePreprod?: boolean;
  includeScenes?: boolean;
  includeShots?: boolean;
  includeAssets?: boolean;
  onlyNewShotIds?: string[];
}): Promise<SpawnPlanItem[]> {
  const episode = await prisma.episode.findUnique({
    where: { id: opts.episodeId },
    include: {
      show: { select: { pipelineKind: true } },
      tasks: { where: { kind: "episode", deletedAt: null }, select: { stage: true, scopeKey: true } },
      scenes: {
        include: {
          tasks: { where: { deletedAt: null }, select: { stage: true, scopeKey: true } },
          shots: { include: { tasks: { where: { deletedAt: null }, select: { stage: true, scopeKey: true } } } },
        },
      },
      assets: { include: { tasks: { where: { deletedAt: null }, select: { stage: true, scopeKey: true } } } },
    },
  });
  if (!episode) throw new Error("Нет серии");
  const spec = specForKind(episode.show.pipelineKind);

  const existing = new Set<string>();
  for (const t of episode.tasks) existing.add(t.scopeKey || taskScopeKey({ stage: t.stage, episodeId: episode.id }));
  for (const sc of episode.scenes) {
    for (const t of sc.tasks) existing.add(t.scopeKey || taskScopeKey({ stage: t.stage, sceneId: sc.id }));
    for (const sh of sc.shots) {
      for (const t of sh.tasks) existing.add(t.scopeKey || taskScopeKey({ stage: t.stage, shotId: sh.id }));
    }
  }
  for (const a of episode.assets) {
    for (const t of a.tasks) existing.add(t.scopeKey || taskScopeKey({ stage: t.stage, assetId: a.id }));
  }

  const items: SpawnPlanItem[] = [];
  const push = (item: SpawnPlanItem) => {
    if (existing.has(item.scopeKey)) return;
    items.push(item);
  };

  if (opts.includePreprod && !opts.sceneId && !opts.shotId && !opts.assetId) {
    for (const stage of spec.episodeStages) {
      push({
        kind: "episode",
        stage,
        label: STAGE_LABEL[stage],
        episodeId: episode.id,
        scopeKey: taskScopeKey({ stage, episodeId: episode.id }),
      });
    }
  }

  const scenes = opts.sceneId ? episode.scenes.filter((s) => s.id === opts.sceneId) : episode.scenes;
  const shotFilter = opts.onlyNewShotIds?.length
    ? new Set(opts.onlyNewShotIds)
    : opts.shotId
      ? new Set([opts.shotId])
      : null;

  for (const sc of scenes) {
    if (opts.includeScenes && !opts.shotId && !opts.assetId) {
      for (const stage of spec.sceneStages) {
        push({
          kind: "scene",
          stage,
          label: STAGE_LABEL[stage],
          episodeId: episode.id,
          sceneId: sc.id,
          scopeKey: taskScopeKey({ stage, sceneId: sc.id }),
        });
      }
    }
    if (opts.includeShots && !opts.assetId) {
      for (const sh of sc.shots) {
        if (shotFilter && !shotFilter.has(sh.id)) continue;
        for (const stage of spec.shotStages) {
          push({
            kind: "shot",
            stage,
            label: STAGE_LABEL[stage],
            episodeId: episode.id,
            sceneId: sc.id,
            shotId: sh.id,
            scopeKey: taskScopeKey({ stage, shotId: sh.id }),
          });
        }
      }
    }
  }

  if (spec.hasAssets && opts.includeAssets && !opts.sceneId && !opts.shotId) {
    const assets = opts.assetId ? episode.assets.filter((a) => a.id === opts.assetId) : episode.assets;
    for (const a of assets) {
      const stages = stagesForAssetKind(a.kind);
      for (const stage of stages) {
        push({
          kind: "asset",
          stage,
          label: STAGE_LABEL[stage],
          episodeId: episode.id,
          assetId: a.id,
          assetKind: a.kind,
          scopeKey: taskScopeKey({ stage, assetId: a.id }),
        });
      }
    }
  }

  return items;
}

export async function spawnBreakdown(opts: {
  user: SessionUser;
  episodeId: string;
  sceneId?: string;
  shotId?: string;
  assetId?: string;
  includePreprod?: boolean;
  includeScenes?: boolean;
  includeShots?: boolean;
  includeAssets?: boolean;
  onlyNewShotIds?: string[];
}) {
  assertLead(opts.user);
  const epKind = await prisma.episode.findUnique({
    where: { id: opts.episodeId },
    select: { show: { select: { pipelineKind: true } } },
  });
  const pipelineKind = epKind?.show.pipelineKind || "e02";
  const plan = await planSpawn(opts);
  const allowed = plan.filter((item) => canLeadProd(opts.user, item.stage, null, pipelineKind));
  const skippedLead = plan.length - allowed.length;
  const skillIndex = await loadSkillIndex();
  const skillRows = await prisma.skill.findMany({ select: { id: true, code: true } });
  const skillIdByCode = new Map(skillRows.map((s) => [s.code, s.id]));
  const created: { id: string; stage: string; assigneeId: string | null }[] = [];
  const errors: string[] = [];
  const assigned = new Map<string, number>();

  for (const item of allowed) {
    try {
      const codes = skillsForKindStage(pipelineKind, item.stage, item.assetKind);
      const assigneeId = uniqueAssignee(skillIndex, codes);
      const skillIds = codes.map((c) => skillIdByCode.get(c)).filter((id): id is string => Boolean(id));
      const task = await createProdTask({
        user: opts.user,
        kind: item.kind,
        stage: item.stage,
        episodeId: item.episodeId,
        sceneId: item.sceneId,
        shotId: item.shotId,
        assetId: item.assetId,
        assigneeId,
        silent: true,
        sheetCode: "breakdown",
        skillIds,
      });
      created.push({ id: task.id, stage: task.stage, assigneeId: task.assigneeId });
      if (assigneeId) assigned.set(assigneeId, (assigned.get(assigneeId) || 0) + 1);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "ошибка";
      if (!msg.includes("уже есть")) errors.push(`${item.label}: ${msg}`);
    }
  }

  for (const [userId, n] of assigned) {
    if (userId === opts.user.id) continue;
    await notify({
      userId,
      title: n === 1 ? "Вам назначили задачу серии" : `Вам назначили ${n} задач серии`,
      body: "Этапы заведены с разбивки пайплайна. Откройте «Мои задачи».",
      link: "/prod",
      urgency: "normal",
    });
  }

  return {
    created: created.length,
    skipped: plan.length - created.length,
    skippedLead,
    errors: errors.slice(0, 8),
    assigned: assigned.size,
  };
}


