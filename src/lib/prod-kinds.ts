import { skillsForE02Stage } from "./pipeline";

export type PipelineKind = "e02" | "ai";

export type KindSpec = {
  kind: PipelineKind;
  label: string;
  deptNames: string[];
  episodeStages: readonly string[];
  sceneStages: readonly string[];
  shotStages: readonly string[];
  hasAssets: boolean;
  sceneSpawnHint: string;
  shotTaskCount: number;
};

export function parsePipelineKind(raw?: string | null): PipelineKind {
  return raw === "ai" ? "ai" : "e02";
}

export const KIND_SPECS: Record<PipelineKind, KindSpec> = {
  e02: {
    kind: "e02",
    label: "3D Superглазка",
    deptNames: ["Анимация", "Производство", "Сценарий"],
    episodeStages: ["script", "direct", "concept"],
    sceneStages: ["animatic", "blocking"],
    shotStages: ["animation", "lipsync", "emotions"],
    hasAssets: true,
    sceneSpawnHint: "Сразу завести этапы: аниматик, блокинг и 3 этапа на каждый шот",
    shotTaskCount: 3,
  },
  ai: {
    kind: "ai",
    label: "ИИ-мультфильм",
    deptNames: ["ИИ"],
    episodeStages: ["script", "storyboard", "concept", "edit"],
    sceneStages: [],
    shotStages: ["first_frame", "gen_video"],
    hasAssets: false,
    sceneSpawnHint: "Сразу завести начальный кадр и генерацию видео на каждый шот",
    shotTaskCount: 2,
  },
};

export function specForKind(kind?: string | null): KindSpec {
  return KIND_SPECS[parsePipelineKind(kind)];
}

export const AI_ONLY_STAGES = new Set(["storyboard", "first_frame", "gen_video"]);
export const AI_WORK_STAGES = ["script", "storyboard", "concept", "edit", "first_frame", "gen_video"] as const;

export function userPipelineKinds(user: {
  prodScope: string;
  departmentName: string | null;
  roleCode: string;
  permissions?: string[];
}): PipelineKind[] {
  if (user.prodScope === "studio" || user.roleCode === "superadmin") return ["e02", "ai"];
  if (user.permissions?.includes("prod.manage")) return ["e02", "ai"];
  const dept = user.departmentName || "";
  if (dept === "ИИ") return ["ai"];
  if (dept === "Анимация" || dept === "Производство" || dept === "Сценарий") return ["e02"];
  return [];
}

export function canSeePipelineKind(
  user: {
    prodScope: string;
    departmentName: string | null;
    roleCode: string;
    permissions?: string[];
  },
  kind?: string | null,
): boolean {
  return userPipelineKinds(user).includes(parsePipelineKind(kind));
}

export function skillsForKindStage(kind: string | null | undefined, stage: string, assetKind?: string): string[] {
  if (parsePipelineKind(kind) === "ai") {
    if (stage === "script") return ["writer"];
    if (stage === "storyboard") return ["storyboard"];
    if (stage === "concept") return ["concept"];
    if (stage === "edit") return ["edit"];
    if (stage === "first_frame") return ["first_frame"];
    if (stage === "gen_video") return ["gen_video"];
    return [];
  }
  return skillsForE02Stage(stage, assetKind);
}

export function taskPipelineKind(t: {
  kind?: string | null;
  stage?: string | null;
  episode?: { show?: { pipelineKind?: string | null } | null } | null;
  scene?: { episode?: { show?: { pipelineKind?: string | null } | null } | null } | null;
  asset?: { episode?: { show?: { pipelineKind?: string | null } | null } | null } | null;
}): string | null {
  if (t.kind === "job" || t.stage === "task") return null;
  return t.episode?.show?.pipelineKind || t.scene?.episode?.show?.pipelineKind || t.asset?.episode?.show?.pipelineKind || null;
}

export function pipelineKindLabel(kind?: string | null): string | null {
  if (kind === "ai") return "ИИ";
  if (kind === "e02") return "Superглазка";
  return null;
}

export function allStageSort(): string[] {
  return [
    "script",
    "direct",
    "storyboard",
    "concept",
    "edit",
    "animatic",
    "blocking",
    "animation",
    "lipsync",
    "emotions",
    "first_frame",
    "gen_video",
    "model",
    "rig",
    "texture",
  ];
}
