import type { SessionUser } from "./types";
import { userCan } from "./types";
import { AI_ONLY_STAGES, parsePipelineKind } from "./prod-kinds";

export const PROD_STATUSES = ["todo", "wip", "done", "revise", "approved", "na", "blocked"] as const;
export type ProdStatus = (typeof PROD_STATUSES)[number];

export const STATUS_LABEL: Record<string, string> = {
  todo: "Не готово",
  wip: "В работе",
  done: "Готово",
  revise: "Под правками",
  approved: "Утверждено",
  na: "Не нужен",
  blocked: "Ждём",
};

export const STATUS_PILL: Record<string, string> = {
  todo: "draft",
  wip: "wait",
  done: "warn",
  revise: "bad",
  approved: "ok",
  na: "draft",
  blocked: "warn",
};

export const STAGE_LABEL: Record<string, string> = {
  script: "Сценарий",
  direct: "Режиссура",
  concept: "Концепт",
  storyboard: "Раскадровка",
  animatic: "Аниматик",
  blocking: "Блокинг",
  animation: "Анимация",
  lipsync: "Липсинк",
  emotions: "Эмоции",
  first_frame: "Начальный кадр",
  gen_video: "Генерация видео",
  edit: "Монтаж",
  model: "Модель",
  rig: "Риг",
  texture: "Текстуры",
  task: "Задача",
};

export const STAGE_WEIGHT: Record<string, number> = {
  lipsync: 1,
  emotions: 1,
  blocking: 1,
  first_frame: 1,
  gen_video: 2,
  animation: 2,
  rig: 2,
  texture: 2,
  model: 3,
  animatic: 3,
  storyboard: 3,
  script: 3,
  direct: 3,
  concept: 2,
  edit: 3,
  task: 1,
};

export const STAGE_COMPLEXITY: Record<string, number> = {
  lipsync: 2,
  emotions: 2,
  blocking: 2,
  first_frame: 2,
  gen_video: 3,
  animation: 3,
  rig: 3,
  texture: 3,
  model: 4,
  animatic: 4,
  storyboard: 3,
  script: 4,
  direct: 4,
  concept: 3,
  edit: 3,
};

export const EPISODE_STAGES = ["script", "direct", "concept"] as const;
export const SHOT_STAGES = ["animation", "lipsync", "emotions"] as const;
export const SCENE_STAGES = ["animatic", "blocking"] as const;
export const CHARACTER_STAGES = ["model", "rig", "texture"] as const;
export const LOCATION_STAGES = ["model", "texture"] as const;
export const PREPROD_STAGES = new Set(["script", "direct", "concept"]);
export const ANIM_STAGES = new Set(["animatic", "blocking", "animation", "lipsync", "emotions"]);
export const MODEL_STAGES = new Set(["model", "rig", "texture"]);

export function stagesForAssetKind(kind: string): readonly string[] {
  return kind === "character" ? CHARACTER_STAGES : LOCATION_STAGES;
}

export const SCENE_PRESETS = [
  { id: "beat", label: "Реплика", shots: 4, hint: "короткий бит, 2–4 плана" },
  { id: "dialog", label: "Диалог", shots: 8, hint: "перебивки и слушанье" },
  { id: "action", label: "Экшн", shots: 14, hint: "много планов, короткие шоты" },
  { id: "bridge", label: "Переход", shots: 2, hint: "связка между сценами" },
] as const;

export const WORK_STATUSES = ["todo", "wip", "revise", "blocked", "done"] as const;

export const STAGE_BAR: Record<string, string> = {
  script: "bg-navy",
  direct: "bg-navy-2",
  concept: "bg-gold",
  storyboard: "bg-navy-2",
  first_frame: "bg-gold",
  gen_video: "bg-navy",
  edit: "bg-ok",
  animation: "bg-navy",
  lipsync: "bg-wait",
  emotions: "bg-gold",
  animatic: "bg-navy-2",
  blocking: "bg-[#5c7a99]",
  model: "bg-gold",
  rig: "bg-ok",
  texture: "bg-warn",
};

export const SHEET_STATUS: Record<string, ProdStatus> = {
  "не готово": "todo",
  "в работе": "wip",
  готово: "done",
  "под правками": "revise",
  утверждено: "approved",
  "не нужен": "na",
  "не нужно": "na",
  "не назначен": "todo",
};

export function parseSheetStatus(raw: string | undefined | null): ProdStatus {
  const s = (raw || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!s) return "todo";
  return SHEET_STATUS[s] || "todo";
}

export function parseSheetDate(raw: string | undefined | null): Date | null {
  if (!raw) return null;
  const t = raw.trim();
  const m = t.match(/(\d{1,2})\D+(\d{1,2})(?:\D+(\d{2,4}))?/);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  let y = m[3] ? Number(m[3]) : 2026;
  if (y < 100) y += 2000;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
}

export function scorePoints(stage: string, complexity: number): number {
  if (stage === "na") return 0;
  const w = STAGE_WEIGHT[stage] ?? 1;
  return w * Math.max(1, Math.min(5, complexity || 3));
}

export function canManageProd(user: SessionUser): boolean {
  return userCan(user, "prod.manage") || user.prodScope === "studio";
}

export function canLeadProd(
  user: SessionUser,
  stage?: string,
  assigneeDept?: string | null,
  pipelineKind?: string | null,
): boolean {
  if (canManageProd(user)) return true;
  if (!userCan(user, "prod.lead")) return false;
  if (user.prodScope === "studio") return true;
  const dept = user.departmentName;
  if (!dept) return false;
  const kind = pipelineKind ? parsePipelineKind(pipelineKind) : null;
  if (kind === "ai" || (stage && AI_ONLY_STAGES.has(stage))) {
    return dept === "ИИ" || assigneeDept === "ИИ";
  }
  if (assigneeDept && assigneeDept === dept) return true;
  if (!stage) return dept === user.departmentName;
  if (stage === "task") return true;
  if (PREPROD_STAGES.has(stage)) return dept !== "ИИ";
  if (ANIM_STAGES.has(stage)) return dept === "Анимация";
  if (MODEL_STAGES.has(stage)) return dept === "Производство";
  if (stage === "edit") return dept === "ИИ";
  return false;
}

export function canWorkTask(user: SessionUser, assigneeId: string | null): boolean {
  if (canManageProd(user) || userCan(user, "prod.lead")) return true;
  return userCan(user, "prod.work") && assigneeId === user.id;
}

export function canSeeProdTask(
  user: SessionUser,
  task: {
    assigneeId: string | null;
    stage: string;
    assignee?: { department?: { name: string } | null } | null;
  },
): boolean {
  if (canManageProd(user)) return true;
  if (task.assigneeId === user.id) return true;
  return canLeadProd(user, task.stage, task.assignee?.department?.name);
}

export const CODE_TO_LOGIN: Record<string, string> = {
  "А_Х.Макс": "khozyainov",
  "А_Х.МАКС": "khozyainov",
  "А_Ева": "rebro",
  "А_Полина": "propastina",
  "А_Ч. Ксюша": "chetverikova",
  "А_Ч.Ксюша": "chetverikova",
  "Т_Даша": "novikova",
  "Т_Вика": "rulko",
  "М_Тима": "mitrofanov",
  "М_Женя": "boyarenok",
  "М_Р. Макс": "radle",
  "М_Р.Макс": "radle",
};

export function loginsFromSheet(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;/]+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => CODE_TO_LOGIN[p] || CODE_TO_LOGIN[p.replace(/\s+/g, " ")] || "")
    .filter(Boolean);
}

export function shareRoot(): string {
  return process.env.SHARE_ROOT || "/srv/samba/share";
}

export function toUnc(absPath: string): string {
  const root = shareRoot().replace(/\\/g, "/");
  const norm = absPath.replace(/\\/g, "/");
  if (norm.toLowerCase().startsWith(root.toLowerCase())) {
    const rel = norm.slice(root.length).replace(/^\//, "").replace(/\//g, "\\");
    return `\\\\WIN-IG5P3PA35H3\\d\\${rel}`;
  }
  return absPath;
}

export function fromWinPath(p: string): string {
  const s = (p || "").trim();
  if (!s) return "";
  const unc = s.replace(/^\\\\Win-ig5p3pa35h3\\d\\/i, "").replace(/^\\\\192\.168\.1\.51\\d\\/i, "");
  const dos = unc.replace(/^D:\\/i, "").replace(/^D:\//i, "");
  return dos.replace(/\\/g, "/");
}

export function taskDiskDir(opts: {
  stage: string;
  shotCode?: string | null;
  sceneCode?: string | null;
  episodeCode?: string;
  assetKind?: string | null;
  assetPath?: string | null;
  sceneDisk?: string | null;
}): string {
  const root = shareRoot();
  if (opts.assetPath) {
    const rel = fromWinPath(opts.assetPath);
    return `${root}/${rel}`.replace(/\/+/g, "/");
  }
  const ep = opts.episodeCode || "EP";
  if (PREPROD_STAGES.has(opts.stage)) {
    return `${root}/Data/${ep}/preprod/${opts.stage}`;
  }
  const sc = opts.sceneCode || "SC01";
  if (opts.stage === "animatic") {
    return `${root}/Data/${ep}/${sc}/2D/animatic/playblast`;
  }
  if (opts.shotCode) {
    const shot = opts.shotCode.replace(/\s+/g, "_");
    const folder = opts.stage === "animation" ? "playblast" : opts.stage;
    return `${root}/Data/${ep}/${sc}/3D/Animation/${shot}/${folder}`;
  }
  return `${root}/Data/${ep}/${sc}/3D/Animation`;
}
