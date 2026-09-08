import { parsePipelineKind, type PipelineKind } from "./prod-kinds";

export type TaskTemplate = {
  id: string;
  group: "free" | "pipeline";
  groupLabel: string;
  label: string;
  kind: "job" | "shot" | "scene" | "asset" | "episode";
  defaultStage: string;
  stages: string[];
  skillCodes: string[];
  pipelineKind: PipelineKind | "any";
};

export const TASK_TEMPLATES: TaskTemplate[] = [
  {
    id: "free",
    group: "free",
    groupLabel: "Свободные",
    label: "Универсальная задача",
    kind: "job",
    defaultStage: "task",
    stages: ["task"],
    skillCodes: [],
    pipelineKind: "any",
  },
  {
    id: "smm",
    group: "free",
    groupLabel: "Свободные",
    label: "СММ",
    kind: "job",
    defaultStage: "task",
    stages: ["task"],
    skillCodes: ["smm"],
    pipelineKind: "any",
  },
  {
    id: "dev",
    group: "free",
    groupLabel: "Свободные",
    label: "Программирование",
    kind: "job",
    defaultStage: "task",
    stages: ["task"],
    skillCodes: ["dev"],
    pipelineKind: "any",
  },
  {
    id: "shot-e02",
    group: "pipeline",
    groupLabel: "Пайплайн Superглазки",
    label: "Шот (анимация / липсинк / эмоции)",
    kind: "shot",
    defaultStage: "animation",
    stages: ["animation", "lipsync", "emotions"],
    skillCodes: [],
    pipelineKind: "e02",
  },
  {
    id: "scene-e02",
    group: "pipeline",
    groupLabel: "Пайплайн Superглазки",
    label: "Сцена (аниматик / блокинг)",
    kind: "scene",
    defaultStage: "animatic",
    stages: ["animatic", "blocking"],
    skillCodes: [],
    pipelineKind: "e02",
  },
  {
    id: "asset-e02",
    group: "pipeline",
    groupLabel: "Пайплайн Superглазки",
    label: "Ассет (модель / риг / текстура)",
    kind: "asset",
    defaultStage: "model",
    stages: ["model", "rig", "texture"],
    skillCodes: [],
    pipelineKind: "e02",
  },
  {
    id: "episode-e02",
    group: "pipeline",
    groupLabel: "Пайплайн Superглазки",
    label: "Серия (сценарий / режиссура / концепт)",
    kind: "episode",
    defaultStage: "script",
    stages: ["script", "direct", "concept"],
    skillCodes: [],
    pipelineKind: "e02",
  },
  {
    id: "shot-ai",
    group: "pipeline",
    groupLabel: "Пайплайн ИИ",
    label: "Шот (начальный кадр / генерация видео)",
    kind: "shot",
    defaultStage: "first_frame",
    stages: ["first_frame", "gen_video"],
    skillCodes: [],
    pipelineKind: "ai",
  },
  {
    id: "episode-ai",
    group: "pipeline",
    groupLabel: "Пайплайн ИИ",
    label: "Серия (сценарий / раскадровка / концепт / монтаж)",
    kind: "episode",
    defaultStage: "script",
    stages: ["script", "storyboard", "concept", "edit"],
    skillCodes: [],
    pipelineKind: "ai",
  },
];

export function templatesForPipeline(pipelineKind?: string | null): TaskTemplate[] {
  if (!pipelineKind) return TASK_TEMPLATES.filter((t) => t.pipelineKind === "any");
  const k = parsePipelineKind(pipelineKind);
  return TASK_TEMPLATES.filter((t) => t.pipelineKind === "any" || t.pipelineKind === k);
}
