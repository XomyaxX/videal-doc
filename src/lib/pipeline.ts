export const SKILLS = [
  {
    code: "writer",
    name: "Сценарист",
    body: "Пишет сценарий серии и сцен. Согласовывает правки с режиссёром и продюсером.",
  },
  {
    code: "director",
    name: "Режиссёр",
    body: "Контролирует производство, составляет ТЗ исполнителям, делает раскадровку.",
  },
  {
    code: "concept",
    name: "Концепт-художник",
    body: "Подбирает референсы и рисует концепты персонажей, локаций и предметов.",
  },
  {
    code: "modeler",
    name: "Моделлер",
    body: "Модели предметов: объём по концепту, ретопология, UV-развёртка.",
  },
  {
    code: "sculptor",
    name: "Скульптор",
    body: "Персонажи и сложные предметы: скульпт, ретопо, UV, одежда, grooming. Может делать риг.",
  },
  {
    code: "texture",
    name: "Текстурщик",
    body: "Текстуры. Если развёртка дырявая — чинит или возвращает моделлеру/скульптору.",
  },
  {
    code: "location",
    name: "Дизайнер локации",
    body: "Расстановка объектов, детали, свет, цвет, видение всей сцены. Берёт готовые модели и текстуры.",
  },
  {
    code: "anim3d",
    name: "3D-аниматор",
    body: "Блокинг, физика, анимация. Может делать риг персонажа.",
  },
  {
    code: "anim2d",
    name: "2D-аниматор",
    body: "Концепт и сборка 2D-персонажа, аниматик, 2D-анимация.",
  },
  {
    code: "comp",
    name: "Композер",
    body: "Сборка слоёв (персонаж, локация, FX, свет), ключи, маски, атмосфера.",
  },
  {
    code: "render",
    name: "Рендер",
    body: "Очередь сцен, проверки, выгон кадров и плейбласта, контроль шума и слоёв.",
  },
  {
    code: "edit",
    name: "Монтаж",
    body: "Сборка серии, ритм, титры, сдача.",
  },
  {
    code: "storyboard",
    name: "Раскадровка",
    body: "Кадры и ритм ИИ-мультфильма. Биты сцен до генерации.",
  },
  {
    code: "first_frame",
    name: "Начальный кадр",
    body: "Ключевой кадр шота: картинка, с которой генерируют видео.",
  },
  {
    code: "gen_video",
    name: "Генерация видео",
    body: "Ролик шота из начального кадра. Сдача — mp4.",
  },
  {
    code: "smm",
    name: "СММ",
    body: "Посты, ролики, обложки, тексты для соцсетей студии.",
  },
  {
    code: "dev",
    name: "Программирование",
    body: "Сайт, внутренние сервисы, скрипты, пайплайн-инструменты.",
  },
] as const;

export type SkillCode = (typeof SKILLS)[number]["code"];

export const SKILL_LABEL: Record<string, string> = Object.fromEntries(SKILLS.map((s) => [s.code, s.name]));

export type PipelineLane = "preprod" | "chars" | "props" | "anim2d" | "anim3d" | "post";

export type PipelineNode = {
  code: string;
  label: string;
  hint: string;
  skills: SkillCode[];
  lane: PipelineLane;
};

export const PIPELINE_NODES: PipelineNode[] = [
  {
    code: "script",
    label: "Сценарий",
    hint: "Текст серии. Дальше не идём, пока не утверждён.",
    skills: ["writer"],
    lane: "preprod",
  },
  {
    code: "direct",
    label: "Режиссура",
    hint: "ТЗ и раскадровка. Отсюда уходит 2D-аниматик, не дожидаясь 3D.",
    skills: ["director"],
    lane: "preprod",
  },
  {
    code: "concept",
    label: "Концепт",
    hint: "Референсы и концепты. Дальше ветка персонажей и ветка предметов.",
    skills: ["concept"],
    lane: "preprod",
  },
  {
    code: "sculpt",
    label: "Скульпт",
    hint: "Персонажи: форма, ретопо, UV, одежда, grooming.",
    skills: ["sculptor"],
    lane: "chars",
  },
  {
    code: "tex_char",
    label: "Текстура персонажа",
    hint: "После скульпта.",
    skills: ["texture"],
    lane: "chars",
  },
  {
    code: "rig",
    label: "Риг",
    hint: "Делает скульптор или 3D-аниматор — кто умеет.",
    skills: ["sculptor", "anim3d"],
    lane: "chars",
  },
  {
    code: "model",
    label: "Модель",
    hint: "Предметы и пропы, не персонажи.",
    skills: ["modeler"],
    lane: "props",
  },
  {
    code: "tex_prop",
    label: "Текстура пропа",
    hint: "После модели.",
    skills: ["texture"],
    lane: "props",
  },
  {
    code: "location",
    label: "Дизайн локации",
    hint: "Расстановка, свет, цвет. Нужны готовые пропы.",
    skills: ["location"],
    lane: "props",
  },
  {
    code: "animatic",
    label: "Аниматик",
    hint: "Можно сразу после раскадровки.",
    skills: ["anim2d"],
    lane: "anim2d",
  },
  {
    code: "char2d",
    label: "2D-персонаж",
    hint: "Сборка персонажа под 2D-мультик.",
    skills: ["anim2d"],
    lane: "anim2d",
  },
  {
    code: "anim2d",
    label: "2D-анимация",
    hint: "После аниматика и 2D-персонажа.",
    skills: ["anim2d"],
    lane: "anim2d",
  },
  {
    code: "anim3d",
    label: "3D-анимация",
    hint: "Когда есть риг героев и собранная локация.",
    skills: ["anim3d"],
    lane: "anim3d",
  },
  {
    code: "comp",
    label: "Композ",
    hint: "Слои персонажа, локации, FX, свет.",
    skills: ["comp"],
    lane: "post",
  },
  {
    code: "render",
    label: "Рендер",
    hint: "Выгон кадров после композа.",
    skills: ["render"],
    lane: "post",
  },
  {
    code: "edit",
    label: "Монтаж",
    hint: "Сборка серии. Сюда же приходит 2D.",
    skills: ["edit"],
    lane: "post",
  },
];

export const PIPELINE_EDGES: [string, string][] = [
  ["script", "direct"],
  ["direct", "concept"],
  ["direct", "animatic"],
  ["direct", "char2d"],
  ["concept", "sculpt"],
  ["concept", "model"],
  ["sculpt", "tex_char"],
  ["tex_char", "rig"],
  ["model", "tex_prop"],
  ["tex_prop", "location"],
  ["rig", "anim3d"],
  ["location", "anim3d"],
  ["animatic", "anim2d"],
  ["char2d", "anim2d"],
  ["anim3d", "comp"],
  ["comp", "render"],
  ["render", "edit"],
  ["anim2d", "edit"],
];

export const PIPELINE_LANES: { id: PipelineLane; label: string }[] = [
  { id: "preprod", label: "Препродакшн" },
  { id: "chars", label: "Персонажи (после концепта)" },
  { id: "props", label: "Предметы и локация (после концепта)" },
  { id: "anim2d", label: "2D (после раскадровки, параллельно 3D)" },
  { id: "anim3d", label: "Сходится: 3D-анимация" },
  { id: "post", label: "Постпродакшн" },
];

/** Старые стадии E02 → скилы, без переименования самих стадий. */
export function skillsForE02Stage(stage: string, assetKind?: string): SkillCode[] {
  if (stage === "script") return ["writer"];
  if (stage === "direct") return ["director"];
  if (stage === "concept") return ["concept"];
  if (stage === "animatic") return ["anim2d"];
  if (stage === "animation" || stage === "lipsync" || stage === "emotions" || stage === "blocking") return ["anim3d"];
  if (stage === "rig") return ["sculptor", "anim3d"];
  if (stage === "texture") return ["texture"];
  if (stage === "model") return assetKind === "character" ? ["sculptor"] : ["modeler"];
  return [];
}

export function nodeByCode(code: string) {
  return PIPELINE_NODES.find((n) => n.code === code);
}
