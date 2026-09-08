"use client";

import { createContext, useContext, useEffect, useMemo, useState, type DragEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Clapperboard, Film, GripVertical, Plus, Sparkles, Trash2 } from "lucide-react";
import { Button, Card, ErrorText, Field, Input, Pill, Select } from "@/components/ui";
import {
  CHARACTER_STAGES,
  SCENE_PRESETS,
  STAGE_LABEL,
  STATUS_LABEL,
  STATUS_PILL,
  stagesForAssetKind,
} from "@/lib/prod";
import { SKILL_LABEL } from "@/lib/pipeline";
import { allStageSort, specForKind, skillsForKindStage, type KindSpec } from "@/lib/prod-kinds";

const KindCtx = createContext<KindSpec>(specForKind("e02"));
function useKind() {
  return useContext(KindCtx);
}

export type Person = { id: string; name: string; skillCodes: string[] };
export type TaskChip = {
  id: string;
  stage: string;
  status: string;
  assigneeId: string | null;
  assigneeName: string | null;
};
export type ShotNode = {
  id: string;
  code: string;
  location: string;
  description: string;
  pct: number;
  sortOrder: number;
  tasks: TaskChip[];
};
export type SceneNode = {
  id: string;
  code: string;
  title: string;
  locationNote: string;
  charactersNote: string;
  pct: number;
  share: number;
  sortOrder: number;
  tasks: TaskChip[];
  shots: ShotNode[];
};
export type AssetNode = {
  id: string;
  name: string;
  kind: string;
  groupName: string;
  pct: number;
  sortOrder: number;
  tasks: TaskChip[];
};

function byStage(tasks: TaskChip[]) {
  return Object.fromEntries(tasks.map((t) => [t.stage, t]));
}

function missing(tasks: TaskChip[], stages: readonly string[]) {
  const have = new Set(tasks.map((t) => t.stage));
  return stages.filter((s) => !have.has(s));
}

function barColor(status?: string) {
  if (status === "approved" || status === "na") return "bg-[var(--ok)]";
  if (status === "done") return "bg-[var(--warn)]";
  if (status === "wip") return "bg-[var(--wait)]";
  if (status === "revise" || status === "blocked") return "bg-[var(--bad)]";
  if (status) return "bg-navy-2";
  return "bg-[#ddd6c8]";
}

function Slider({
  value,
  min,
  max,
  onChange,
  label,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  label: string;
}) {
  const pct = max === min ? 100 : ((value - min) / (max - min)) * 100;
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between text-sm font-semibold text-navy">
        {label}
        <span className="tabular-nums text-gold">{value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="vd-slider"
        style={{ ["--pct" as string]: `${pct}%` }}
      />
    </label>
  );
}

function uniquePerson(people: Person[], stage: string, assetKind?: string, kind?: string) {
  const need = skillsForKindStage(kind, stage, assetKind);
  const matches = people.filter((p) => need.some((c) => p.skillCodes.includes(c)));
  return matches.length === 1 ? matches[0] : null;
}

function StageStrip({
  stages,
  tasks,
}: {
  stages: readonly string[];
  tasks: TaskChip[];
}) {
  const map = byStage(tasks);
  return (
    <div className="bd-stage" title={stages.map((s) => `${STAGE_LABEL[s]}: ${map[s] ? STATUS_LABEL[map[s].status] : "нет задачи"}`).join(" · ")}>
      {stages.map((s) => (
        <i key={s} className={barColor(map[s]?.status)} />
      ))}
    </div>
  );
}

function dropTo(from: number, over: number) {
  if (from === over) return from + 1;
  if (from < over) return over;
  return over + 1;
}

function tileDrag(opts: {
  enabled: boolean;
  armed: boolean;
  group: string;
  id: string;
  index: number;
  onMove: (to: number) => void;
}) {
  return {
    draggable: opts.enabled && opts.armed,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.setData("text/plain", `vd:${opts.group}:${opts.id}:${opts.index}`);
      e.dataTransfer.effectAllowed = "move";
      (e.currentTarget as HTMLElement).classList.add("bd-dragging");
    },
    onDragEnd: (e: DragEvent) => {
      (e.currentTarget as HTMLElement).classList.remove("bd-dragging", "bd-drop-over");
    },
    onDragOver: (e: DragEvent) => {
      if (!opts.enabled) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      (e.currentTarget as HTMLElement).classList.add("bd-drop-over");
    },
    onDragLeave: (e: DragEvent) => {
      (e.currentTarget as HTMLElement).classList.remove("bd-drop-over");
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      (e.currentTarget as HTMLElement).classList.remove("bd-drop-over");
      const raw = e.dataTransfer.getData("text/plain");
      const m = /^vd:([^:]+):([^:]+):(\d+)$/.exec(raw || "");
      if (!m || m[1] !== opts.group || m[2] === opts.id) return;
      opts.onMove(dropTo(Number(m[3]), opts.index));
    },
  };
}

function OrderBar({
  index,
  disabled,
  onMove,
  onRemove,
  removeTitle,
  onArm,
}: {
  index: number;
  total: number;
  disabled: boolean;
  onMove: (to: number) => void;
  onRemove: () => void;
  removeTitle: string;
  onArm?: (v: boolean) => void;
}) {
  const [val, setVal] = useState(String(index + 1));
  useEffect(() => {
    setVal(String(index + 1));
  }, [index]);
  function commit() {
    const n = Number(val);
    if (!Number.isFinite(n) || n < 1) {
      setVal(String(index + 1));
      return;
    }
    if (Math.round(n) === index + 1) return;
    onMove(Math.round(n));
  }
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      {onArm ? (
        <button
          type="button"
          title="Перетащить"
          disabled={disabled}
          className="bd-grab rounded-md p-1 text-muted hover:text-navy disabled:opacity-30"
          onMouseDown={() => onArm(true)}
          onMouseUp={() => onArm(false)}
          onClick={(e) => e.preventDefault()}
        >
          <GripVertical size={16} />
        </button>
      ) : null}
      <input
        className="h-7 w-8 rounded-md border border-line bg-white text-center text-xs font-semibold tabular-nums text-navy"
        value={val}
        disabled={disabled}
        onChange={(e) => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        aria-label="Порядок"
      />
      <button
        type="button"
        title={removeTitle}
        disabled={disabled}
        className="rounded-md p-1 text-muted hover:text-bad"
        onClick={onRemove}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

const STAGE_SORT = allStageSort();

function familyName(name: string | null) {
  return name?.trim().split(/\s+/)[0] || "не назначен";
}

function StagePills({ tasks }: { tasks: TaskChip[] }) {
  if (!tasks.length) return <span className="text-xs text-muted">этапов ещё нет</span>;
  const groups = new Map<string, TaskChip[]>();
  for (const t of tasks) {
    const key = familyName(t.assigneeName);
    const list = groups.get(key);
    if (list) list.push(t);
    else groups.set(key, [t]);
  }
  const names = [...groups.keys()].sort((a, b) => {
    if (a === "не назначен") return 1;
    if (b === "не назначен") return -1;
    return a.localeCompare(b, "ru");
  });
  function rank(stage: string) {
    const i = STAGE_SORT.indexOf(stage as (typeof STAGE_SORT)[number]);
    return i < 0 ? 99 : i;
  }
  return (
    <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,11rem),1fr))] gap-2">
      {names.map((name) => {
        const list = groups.get(name) || [];
        const byStage = new Map<string, TaskChip[]>();
        for (const t of list) {
          const row = byStage.get(t.stage);
          if (row) row.push(t);
          else byStage.set(t.stage, [t]);
        }
        const stages = [...byStage.keys()].sort((a, b) => rank(a) - rank(b));
        const full = list.find((t) => t.assigneeName)?.assigneeName || name;
        return (
          <div key={name} className="min-w-0 rounded-xl border border-line bg-paper p-3">
            <div className="truncate font-semibold text-navy" title={full}>
              {name}
            </div>
            <div className="mt-1.5 space-y-1">
              {stages.map((stage) => (
                <div key={stage} className="flex min-w-0 items-start gap-2">
                  <span className="w-[4.75rem] shrink-0 text-[11px] leading-4 text-muted">{STAGE_LABEL[stage] || stage}</span>
                  <span className="flex min-w-0 flex-1 flex-wrap content-start gap-0.5 pt-px">
                    {(byStage.get(stage) || []).map((t) => (
                      <Link
                        key={t.id}
                        href={`/prod/tasks/${t.id}`}
                        title={`${STAGE_LABEL[t.stage] || t.stage} · ${STATUS_LABEL[t.status] || t.status}`}
                        aria-label={`${STAGE_LABEL[t.stage] || t.stage}, ${STATUS_LABEL[t.status] || t.status}`}
                        className={`block h-3 w-3 shrink-0 rounded-[3px] ${barColor(t.status)} hover:ring-2 hover:ring-inset hover:ring-gold`}
                      />
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function BreakdownBoard({
  episode,
  people,
  canEdit,
  shows,
}: {
  episode: {
    id: string;
    code: string;
    name: string;
    showName: string;
    pct: number;
    scenesPct: number;
    assetsPct: number;
    preprodPct: number;
    tasks: TaskChip[];
    scenes: SceneNode[];
    assets: AssetNode[];
    pipelineKind?: string;
  };
  people: Person[];
  canEdit: boolean;
  shows: { id: string; name: string }[];
}) {
  const spec = specForKind(episode.pipelineKind);
  const router = useRouter();
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const first = episode.scenes[0]?.id;
    return first ? { [first]: true } : {};
  });

  const missingPreprod = missing(episode.tasks, spec.episodeStages);
  const missingScene = episode.scenes.reduce((n, s) => n + missing(s.tasks, spec.sceneStages).length, 0);
  const missingShot = episode.scenes.reduce(
    (n, s) => n + s.shots.reduce((m, sh) => m + missing(sh.tasks, spec.shotStages).length, 0),
    0,
  );
  const missingAsset = episode.assets.reduce(
    (n, a) => n + missing(a.tasks, stagesForAssetKind(a.kind)).length,
    0,
  );
  const missingAll = missingPreprod.length + missingScene + missingShot + missingAsset;

  async function post(url: string, body: Record<string, unknown>, key: string) {
    setBusy(key);
    setError("");
    setNote("");
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) {
      setError(data.error || "Не удалось");
      return null;
    }
    if (typeof data.spawned === "number" && data.spawned > 0) {
      setNote(`Завели ${data.spawned} задач.`);
    } else if (typeof data.created === "number") {
      const skip = data.skippedLead ? ` Этапы другого отдела не трогали (${data.skippedLead}).` : "";
      setNote(
        data.created
          ? `Завели ${data.created} задач${data.assigned ? `, назначили ${data.assigned}` : ""}.${skip}`
          : `Все выбранные этапы уже были.${skip}`,
      );
    }
    router.refresh();
    return data;
  }

  function spawn(body: Record<string, unknown>, key: string) {
    return post("/api/prod/breakdown/spawn", { episodeId: episode.id, ...body }, key);
  }

  return (
    <KindCtx.Provider value={spec}>
    <div className="space-y-6">
      <ErrorText>{error}</ErrorText>
      {note ? (
        <p className="bd-pop rounded-xl bg-[var(--ok-bg)] px-3 py-2 text-sm text-[var(--ok)]">{note}</p>
      ) : null}

      <Card className="bd-card overflow-hidden">
        <div className="flex flex-wrap items-center gap-5">
          <div className="bd-ring" style={{ ["--p" as string]: episode.pct }}>
            <span>{episode.pct}%</span>
          </div>
          <div className="min-w-[200px] flex-1">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-gold">Съёмка серии</div>
            <h2 className="font-serif text-3xl text-navy">
              {episode.showName} · {episode.code}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {episode.name} · препродакшн {episode.preprodPct}% · сцены {episode.scenesPct}% · ассеты {episode.assetsPct}%
            </p>
          </div>
          {canEdit ? (
            <Button
              disabled={Boolean(busy) || missingAll === 0}
              onClick={() =>
                spawn(
                  {
                    includePreprod: true,
                    includeScenes: true,
                    includeShots: true,
                    includeAssets: true,
                  },
                  "all",
                )
              }
            >
              <Sparkles size={16} />
              {busy === "all" ? "Заводим…" : missingAll ? `Завести ${missingAll} этапов` : "Все этапы на месте"}
            </Button>
          ) : null}
        </div>
        <p className="mt-4 text-sm text-muted">
          Как на площадке: сначала серия, внутри сцены, внутри сцен — шоты. Этапы не рисуют руками по одной карточке:
          нехватающие заводятся пачкой. Если скил отмечен только у одного человека — задача сразу его.
        </p>
      </Card>

      <div className={`grid gap-3 ${spec.episodeStages.length > 3 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3"}`}>
        {spec.episodeStages.map((stage, i) => {
          const task = byStage(episode.tasks)[stage];
          const who = uniquePerson(people, stage, undefined, spec.kind);
          const skillCode = skillsForKindStage(spec.kind, stage)[0];
          return (
            <Card key={stage} className="bd-card" style={{ animationDelay: `${i * 60}ms` }}>
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-gold">этап серии</div>
              <div className="mt-2 font-serif text-2xl text-navy">{STAGE_LABEL[stage] || stage}</div>
              <p className="mt-1 text-sm text-muted">
                {task
                  ? task.assigneeName || "без исполнителя"
                  : who
                    ? `назначим ${who.name}`
                    : `скил «${(skillCode && SKILL_LABEL[skillCode]) || "—"}»`}
              </p>
              <div className="mt-3">
                {task ? (
                  <Link href={`/prod/tasks/${task.id}`}>
                    <Pill tone={STATUS_PILL[task.status] || "draft"}>{STATUS_LABEL[task.status]}</Pill>
                  </Link>
                ) : canEdit ? (
                  <Button
                    variant="secondary"
                    disabled={Boolean(busy)}
                    onClick={() => spawn({ includePreprod: true }, `pre-${stage}`)}
                  >
                    Завести
                  </Button>
                ) : (
                  <span className="text-sm text-muted">ещё не заведён</span>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {canEdit ? <SceneComposer episodeId={episode.id} busy={Boolean(busy)} onSubmit={(body, key) => post("/api/prod/breakdown", body, key)} /> : null}

      <div className="space-y-3">
        {episode.scenes.length === 0 ? (
          <Card>
            <p className="font-serif text-xl text-navy">Сцен пока нет</p>
            <p className="mt-1 text-sm text-muted">
              Добавьте первую сцену и сразу укажите, сколько в ней шотов — как режиссёр на разбивке.
            </p>
          </Card>
        ) : (
          episode.scenes.map((scene, i) => (
            <SceneBlock
              key={scene.id}
              scene={scene}
              index={i}
              total={episode.scenes.length}
              people={people}
              canEdit={canEdit}
              open={Boolean(open[scene.id])}
              delay={i * 40}
              busy={Boolean(busy)}
              onToggle={() => setOpen((s) => ({ ...s, [scene.id]: !s[scene.id] }))}
              onPatch={(body, key) => post("/api/prod/breakdown", body, key)}
              onSpawn={(body, key) => spawn(body, key)}
            />
          ))
        )}
      </div>

      {spec.hasAssets ? (
        <AssetSection
          episodeId={episode.id}
          assets={episode.assets}
          people={people}
          canEdit={canEdit}
          busy={Boolean(busy)}
          onPost={(body, key) => post("/api/prod/breakdown", body, key)}
          onSpawn={(body, key) => spawn(body, key)}
        />
      ) : null}

      {canEdit ? <NewEpisodeCard shows={shows} busy={Boolean(busy)} onSubmit={(body, key) => post("/api/prod/breakdown", body, key)} /> : null}
    </div>
    </KindCtx.Provider>
  );
}

function SceneComposer({
  episodeId,
  busy,
  onSubmit,
}: {
  episodeId: string;
  busy: boolean;
  onSubmit: (body: Record<string, unknown>, key: string) => Promise<unknown>;
}) {
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [characters, setCharacters] = useState("");
  const [shots, setShots] = useState(1);
  const [preset, setPreset] = useState("");
  const spec = useKind();
  const [spawn, setSpawn] = useState(true);
  const ghosts = useMemo(
    () => Array.from({ length: shots }, (_, i) => `Shot_${String(i + 1).padStart(2, "0")}`),
    [shots],
  );

  return (
    <Card className="bd-card">
      <div className="mb-3 flex items-center gap-2">
        <Film size={18} className="text-gold" />
        <h3 className="font-serif text-2xl text-navy">Новая сцена</h3>
      </div>
      <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-3">
          <Field label="Как в сценарии">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Кухня. Утро. Разговор с мамой" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Локация">
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="кухня / двор" />
            </Field>
            <Field label="Кто в кадре">
              <Input value={characters} onChange={(e) => setCharacters(e.target.value)} placeholder="Маша, папа" />
            </Field>
          </div>
          <Field label="Шаблон" hint="по желанию — подставит число шотов">
            <Select
              value={preset}
              onChange={(e) => {
                const id = e.target.value;
                setPreset(id);
                const p = SCENE_PRESETS.find((x) => x.id === id);
                if (p) setShots(p.shots);
              }}
            >
              <option value="">Без шаблона — свой набор</option>
              {SCENE_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} · {p.shots} шотов — {p.hint}
                </option>
              ))}
            </Select>
          </Field>
          <Slider
            value={shots}
            min={1}
            max={24}
            onChange={(n) => {
              setShots(n);
              const match = SCENE_PRESETS.find((p) => p.shots === n);
              setPreset(match?.id || "");
            }}
            label="Шотов в сцене"
          />
          <label className="flex items-center gap-2 text-sm text-navy">
            <input type="checkbox" checked={spawn} onChange={(e) => setSpawn(e.target.checked)} />
            {spec.sceneSpawnHint}
            <span className="text-muted">
              ({spec.sceneStages.length + shots * spec.shotTaskCount} задач)
            </span>
          </label>
          <Button
            disabled={busy || !title.trim()}
            onClick={async () => {
              const ok = await onSubmit(
                {
                  action: "createScene",
                  episodeId,
                  title,
                  locationNote: location,
                  charactersNote: characters,
                  shotCount: shots,
                  spawn,
                },
                "scene",
              );
              if (ok) {
                setTitle("");
                setLocation("");
                setCharacters("");
                setShots(1);
                setPreset("");
              }
            }}
          >
            <Plus size={16} />
            Добавить сцену
          </Button>
        </div>
        <div>
          <div className="mb-2 text-sm font-semibold text-navy">Превью плёнки</div>
          <div className="bd-film">
            {ghosts.map((code, i) => (
              <div key={code} className="bd-shot is-ghost" style={{ animationDelay: `${i * 30}ms` }}>
                <div className="pl-2 font-semibold">{code}</div>
                <div className="mt-3 px-1">
                  <StageStrip stages={spec.shotStages} tasks={[]} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

function SceneBlock({
  scene,
  index,
  total,
  people,
  canEdit,
  open,
  delay,
  busy,
  onToggle,
  onPatch,
  onSpawn,
}: {
  scene: SceneNode;
  index: number;
  total: number;
  people: Person[];
  canEdit: boolean;
  open: boolean;
  delay: number;
  busy: boolean;
  onToggle: () => void;
  onPatch: (body: Record<string, unknown>, key: string) => Promise<unknown>;
  onSpawn: (body: Record<string, unknown>, key: string) => Promise<unknown>;
}) {
  const spec = useKind();
  const [title, setTitle] = useState(scene.title);
  const [add, setAdd] = useState(2);
  const [armed, setArmed] = useState(false);
  const miss =
    missing(scene.tasks, spec.sceneStages).length +
    scene.shots.reduce((n, sh) => n + missing(sh.tasks, spec.shotStages).length, 0);
  const drag = tileDrag({
    enabled: canEdit && !busy,
    armed,
    group: "scene",
    id: scene.id,
    index,
    onMove: (to) => onPatch({ action: "reorder", target: "scene", id: scene.id, to }, `ord-sc-${scene.id}`),
  });

  return (
    <div
      className="bd-card min-w-0 overflow-hidden rounded-2xl border border-line bg-card shadow-[var(--shadow)]"
      style={{ animationDelay: `${delay}ms` }}
      {...drag}
      onDragEnd={(e) => {
        drag.onDragEnd(e);
        setArmed(false);
      }}
    >
      <div className="flex w-full flex-wrap items-center gap-3 px-5 py-4">
        <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <ChevronDown size={18} className={`shrink-0 text-gold transition-transform ${open ? "rotate-0" : "-rotate-90"}`} />
          <Clapperboard size={18} className="shrink-0 text-navy" />
          <div className="min-w-0 flex-1">
            <div className="font-serif text-2xl text-navy">
              {scene.code} · {scene.title}
            </div>
            <div className="text-sm text-muted">
              {scene.shots.length} шотов · вклад в серию {scene.share}% · {scene.pct}%
            </div>
          </div>
        </button>
        <div className="hidden w-40 sm:block">
          <div className="h-2 overflow-hidden rounded-full bg-[#ddd6c8]">
            <div className="h-full rounded-full bg-gold transition-[width] duration-500" style={{ width: `${scene.pct}%` }} />
          </div>
        </div>
        {miss > 0 ? (
          <span className="rounded-full bg-[#fff8ec] px-2 py-0.5 text-xs font-semibold text-gold">{miss} не хватает</span>
        ) : null}
        {canEdit ? (
          <OrderBar
            index={index}
            total={total}
            disabled={busy}
            onMove={(to) => onPatch({ action: "reorder", target: "scene", id: scene.id, to }, `ord-sc-${scene.id}`)}
            onRemove={() => {
              if (confirm("Удалить сцену, шоты и их задачи? Файлы на диске останутся.")) {
                void onPatch({ action: "removeScene", sceneId: scene.id }, `rm-${scene.id}`);
              }
            }}
            removeTitle="Удалить сцену"
            onArm={setArmed}
          />
        ) : null}
      </div>
      {scene.tasks.length ? (
        <div className="px-5 pb-4">
          <StagePills tasks={scene.tasks} />
        </div>
      ) : null}
      <div className={`bd-fold ${open ? "open" : ""}`}>
        <div>
          <div className="min-w-0 space-y-4 border-t border-line px-5 py-4">
            {canEdit ? (
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <Field label="Название сцены">
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onBlur={() => {
                      if (title.trim() && title.trim() !== scene.title) {
                        void onPatch({ action: "patchScene", sceneId: scene.id, title }, `pt-${scene.id}`);
                      }
                    }}
                  />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="gold"
                    disabled={busy || miss === 0}
                    onClick={() =>
                      onSpawn({ sceneId: scene.id, includeScenes: true, includeShots: true }, `sp-${scene.id}`)
                    }
                  >
                    {miss ? `Завести ${miss} этапов сцены` : "Этапы сцены на месте"}
                  </Button>
                </div>
              </div>
            ) : null}
            {(scene.locationNote || scene.charactersNote) && (
              <p className="text-sm text-muted">
                {scene.locationNote}
                {scene.locationNote && scene.charactersNote ? " · " : ""}
                {scene.charactersNote}
              </p>
            )}
            <div className="bd-film">
              {scene.shots.map((shot, i) => (
                <ShotCard
                  key={shot.id}
                  shot={shot}
                  index={i}
                  total={scene.shots.length}
                  group={`shot-${scene.id}`}
                  canEdit={canEdit}
                  busy={busy}
                  delay={i * 35}
                  people={people}
                  onPatch={onPatch}
                  onSpawn={onSpawn}
                />
              ))}
            </div>
            {canEdit ? (
              <div className="flex flex-wrap items-end gap-4 rounded-xl bg-paper px-4 py-3">
                <div className="min-w-[180px] flex-1">
                  <Slider value={add} min={1} max={12} onChange={setAdd} label="Добавить шоты" />
                </div>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    onPatch({ action: "addShots", sceneId: scene.id, count: add, spawn: true }, `add-${scene.id}`)
                  }
                >
                  <Plus size={16} />
                  {add} шота и этапы
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function ShotCard({
  shot,
  index,
  total,
  group,
  canEdit,
  busy,
  delay,
  people,
  onPatch,
  onSpawn,
}: {
  shot: ShotNode;
  index: number;
  total: number;
  group: string;
  canEdit: boolean;
  busy: boolean;
  delay: number;
  people: Person[];
  onPatch: (body: Record<string, unknown>, key: string) => Promise<unknown>;
  onSpawn: (body: Record<string, unknown>, key: string) => Promise<unknown>;
}) {
  const spec = useKind();
  const [armed, setArmed] = useState(false);
  const miss = missing(shot.tasks, spec.shotStages);
  const map = byStage(shot.tasks);
  const href = shot.tasks.find((t) => t.status !== "approved" && t.status !== "na")?.id || shot.tasks[0]?.id;
  const drag = tileDrag({
    enabled: canEdit && !busy,
    armed,
    group,
    id: shot.id,
    index,
    onMove: (to) => onPatch({ action: "reorder", target: "shot", id: shot.id, to }, `ord-sh-${shot.id}`),
  });
  return (
    <div
      className="bd-shot"
      style={{ animationDelay: `${delay}ms` }}
      {...drag}
      onDragEnd={(e) => {
        drag.onDragEnd(e);
        setArmed(false);
      }}
    >
      <div className="flex flex-col gap-1 pl-2 pr-2">
        <div className="flex items-start justify-between gap-1">
          <div>
            <div className="font-semibold text-navy">{shot.code}</div>
            <div className="text-xs tabular-nums text-muted">{shot.pct}%</div>
          </div>
        </div>
        {canEdit ? (
          <OrderBar
            index={index}
            total={total}
            disabled={busy}
            onMove={(to) => onPatch({ action: "reorder", target: "shot", id: shot.id, to }, `ord-sh-${shot.id}`)}
            onRemove={() => {
              if (confirm("Удалить шот и его задачи? Файлы на диске останутся.")) {
                void onPatch({ action: "removeShot", shotId: shot.id }, `rms-${shot.id}`);
              }
            }}
            removeTitle="Удалить шот"
            onArm={setArmed}
          />
        ) : null}
      </div>
      {canEdit ? (
        <input
          className="mt-2 w-full rounded-lg border border-transparent bg-transparent px-2 py-1 text-xs text-muted outline-none hover:border-line focus:border-gold"
          defaultValue={shot.location}
          placeholder="локация кадра"
          onBlur={(e) => {
            if (e.target.value.trim() !== shot.location) {
              void onPatch({ action: "patchShot", shotId: shot.id, location: e.target.value }, `loc-${shot.id}`);
            }
          }}
        />
      ) : shot.location ? (
        <div className="mt-2 px-2 text-xs text-muted">{shot.location}</div>
      ) : null}
      <div className="mt-2 px-1">
        <StageStrip stages={spec.shotStages} tasks={shot.tasks} />
      </div>
      <div className="mt-2 flex flex-wrap gap-1 px-1">
        {spec.shotStages.map((st) => {
          const t = map[st];
          if (t) {
            return (
              <Link key={st} href={`/prod/tasks/${t.id}`} className="text-[11px] font-semibold text-navy hover:text-gold">
                {STAGE_LABEL[st]}
              </Link>
            );
          }
          return (
            <span key={st} className="text-[11px] text-muted">
              {STAGE_LABEL[st]}
            </span>
          );
        })}
      </div>
      {canEdit && miss.length ? (
        <button
          type="button"
          disabled={busy}
          className="mt-2 w-full rounded-lg bg-paper px-2 py-1 text-[11px] font-semibold text-navy hover:bg-[#fff8ec]"
          onClick={() => onSpawn({ shotId: shot.id, includeShots: true }, `sh-${shot.id}`)}
        >
          завести {miss.length}
          {uniquePerson(people, miss[0], undefined, spec.kind)
            ? ` → ${uniquePerson(people, miss[0], undefined, spec.kind)!.name.split(" ")[0]}`
            : ""}
        </button>
      ) : href ? (
        <Link href={`/prod/tasks/${href}`} className="mt-2 block px-1 text-[11px] font-semibold text-gold">
          открыть
        </Link>
      ) : null}
    </div>
  );
}

function AssetRow({
  asset,
  index,
  total,
  people,
  canEdit,
  busy,
  onPost,
  onSpawn,
}: {
  asset: AssetNode;
  index: number;
  total: number;
  people: Person[];
  canEdit: boolean;
  busy: boolean;
  onPost: (body: Record<string, unknown>, key: string) => Promise<unknown>;
  onSpawn: (body: Record<string, unknown>, key: string) => Promise<unknown>;
}) {
  const [armed, setArmed] = useState(false);
  const drag = tileDrag({
    enabled: canEdit && !busy,
    armed,
    group: `asset-${asset.kind}`,
    id: asset.id,
    index,
    onMove: (to) => onPost({ action: "reorder", target: "asset", id: asset.id, to }, `ord-as-${asset.id}`),
  });
  const stages = asset.kind === "character" ? CHARACTER_STAGES : stagesForAssetKind(asset.kind);
  const miss = missing(asset.tasks, stages);
  return (
    <li
      className="min-w-0 py-3"
      {...drag}
      onDragEnd={(e) => {
        drag.onDragEnd(e);
        setArmed(false);
      }}
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <span className="min-w-0 flex-1 break-words font-medium" title={asset.name}>
          {asset.name}
        </span>
        <span className="shrink-0 text-xs tabular-nums text-muted">{asset.pct}%</span>
      </div>
      {canEdit ? (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <select
            className="rounded-lg border border-line bg-white px-2 py-1 text-xs text-navy"
            value={asset.kind}
            disabled={busy}
            onChange={(e) => onPost({ action: "patchAsset", assetId: asset.id, kind: e.target.value }, `ak-${asset.id}`)}
          >
            <option value="character">персонаж</option>
            <option value="location">локация</option>
            <option value="prop">проп</option>
          </select>
          <OrderBar
            index={index}
            total={total}
            disabled={busy}
            onMove={(to) => onPost({ action: "reorder", target: "asset", id: asset.id, to }, `ord-as-${asset.id}`)}
            onRemove={() => {
              if (confirm("Удалить плитку и её задачи? Файлы на диске останутся.")) {
                void onPost({ action: "removeAsset", assetId: asset.id }, `rm-as-${asset.id}`);
              }
            }}
            removeTitle="Удалить"
            onArm={setArmed}
          />
        </div>
      ) : null}
      <div className="mt-2 min-w-0">
        <StageStrip stages={stages} tasks={asset.tasks} />
      </div>
      <div className="mt-2 min-w-0">
        <StagePills tasks={asset.tasks} />
      </div>
      {canEdit && miss.length ? (
        <button
          type="button"
          disabled={busy}
          className="mt-2 text-xs font-semibold text-navy hover:text-gold"
          onClick={() => onSpawn({ assetId: asset.id, includeAssets: true }, `as-${asset.id}`)}
        >
          завести {miss.map((s) => STAGE_LABEL[s]).join(", ")}
          {uniquePerson(people, miss[0], asset.kind, "e02")
            ? ` → ${uniquePerson(people, miss[0], asset.kind, "e02")!.name.split(" ")[0]}`
            : ""}
        </button>
      ) : null}
    </li>
  );
}

function AssetSection({
  episodeId,
  assets,
  people,
  canEdit,
  busy,
  onPost,
  onSpawn,
}: {
  episodeId: string;
  assets: AssetNode[];
  people: Person[];
  canEdit: boolean;
  busy: boolean;
  onPost: (body: Record<string, unknown>, key: string) => Promise<unknown>;
  onSpawn: (body: Record<string, unknown>, key: string) => Promise<unknown>;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState("character");
  const groups = [
    {
      id: "character",
      label: "Персонажи",
      items: assets.filter((a) => a.kind === "character").sort((a, b) => a.sortOrder - b.sortOrder),
    },
    {
      id: "location",
      label: "Локации",
      items: assets.filter((a) => a.kind === "location").sort((a, b) => a.sortOrder - b.sortOrder),
    },
    {
      id: "prop",
      label: "Пропы",
      items: assets.filter((a) => a.kind === "prop").sort((a, b) => a.sortOrder - b.sortOrder),
    },
  ];

  function propClusters(items: AssetNode[]) {
    const map = new Map<string, AssetNode[]>();
    for (const a of items) {
      const key = a.groupName?.trim() || "Прочее";
      const list = map.get(key) || [];
      list.push(a);
      map.set(key, list);
    }
    return [...map.entries()].sort((a, b) => (a[1][0]?.sortOrder || 0) - (b[1][0]?.sortOrder || 0));
  }
  return (
    <div>
      <h2 className="mb-3 font-serif text-2xl text-navy">Ассеты серии</h2>
      {canEdit ? (
        <Card className="bd-card mb-4 min-w-0">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1 basis-[12rem]">
              <Field label="Новый ассет">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="имя персонажа или предмета"
                  title="имя персонажа или предмета"
                  className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap placeholder:overflow-hidden placeholder:text-ellipsis placeholder:whitespace-nowrap"
                />
              </Field>
            </div>
            <div className="w-full min-w-0 sm:w-56 sm:flex-none">
              <Field label="Тип">
                <Select value={kind} onChange={(e) => setKind(e.target.value)} className="min-w-0">
                  <option value="character">персонаж · модель, риг, текстура</option>
                  <option value="location">локация · модель, текстура</option>
                  <option value="prop">проп · модель, текстура</option>
                </Select>
              </Field>
            </div>
            <Button
              className="shrink-0"
              disabled={busy || !name.trim()}
              onClick={async () => {
                const ok = await onPost(
                  { action: "createAsset", episodeId, kind, name, spawn: true },
                  "asset",
                );
                if (ok) setName("");
              }}
            >
              <Plus size={16} />
              Добавить и завести этапы
            </Button>
          </div>
        </Card>
      ) : null}
      <div className="grid min-w-0 gap-4 overflow-x-hidden lg:grid-cols-3">
        {groups.map((g) => (
          <Card key={g.id} className="bd-card flex min-w-0 flex-col overflow-hidden !p-0">
            <h3 className="sticky top-0 z-10 border-b border-line bg-card px-5 py-4 font-serif text-xl text-navy">
              {g.label}
              <span className="ml-2 text-sm font-sans font-normal text-muted">{g.items.length}</span>
            </h3>
            {g.items.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted">Пусто.</p>
            ) : (
              <div className="bd-col-scroll px-5">
                {g.id === "prop" ? (
                  <div className="space-y-4 py-1">
                    {propClusters(g.items).map(([cluster, rows]) => (
                      <div key={cluster}>
                        <div
                          className="sticky top-0 truncate bg-card py-1 text-xs font-semibold uppercase tracking-[0.12em] text-gold"
                          title={cluster}
                        >
                          {cluster}
                        </div>
                        <ul className="divide-y divide-line">
                          {rows.map((a) => (
                            <AssetRow
                              key={a.id}
                              asset={a}
                              index={g.items.findIndex((x) => x.id === a.id)}
                              total={g.items.length}
                              people={people}
                              canEdit={canEdit}
                              busy={busy}
                              onPost={onPost}
                              onSpawn={onSpawn}
                            />
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                ) : (
                  <ul className="divide-y divide-line">
                    {g.items.map((a, i) => (
                      <AssetRow
                        key={a.id}
                        asset={a}
                        index={i}
                        total={g.items.length}
                        people={people}
                        canEdit={canEdit}
                        busy={busy}
                        onPost={onPost}
                        onSpawn={onSpawn}
                      />
                    ))}
                  </ul>
                )}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

function NewEpisodeCard({
  shows,
  busy,
  onSubmit,
}: {
  shows: { id: string; name: string }[];
  busy: boolean;
  onSubmit: (body: Record<string, unknown>, key: string) => Promise<unknown>;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [showId, setShowId] = useState(shows[0]?.id || "");
  return (
    <details className="rounded-2xl border border-dashed border-line bg-white/50 p-5">
      <summary className="cursor-pointer font-serif text-xl text-navy">Новая серия</summary>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {shows.length ? (
          <Field label="Проект">
            <Select value={showId} onChange={(e) => setShowId(e.target.value)}>
              {shows.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Field label="Код" hint="E03">
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="E03" />
        </Field>
        <Field label="Название">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Весенняя серия" />
        </Field>
      </div>
      <div className="mt-3">
        <Button
          variant="secondary"
          disabled={busy || !code.trim() || !name.trim()}
          onClick={() => onSubmit({ action: "createEpisode", showId, code, name }, "ep")}
        >
          Создать и открыть
        </Button>
      </div>
    </details>
  );
}

export function EmptyEpisodeStart({
  shows,
}: {
  shows: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [code, setCode] = useState("E03");
  const [name, setName] = useState("");
  const [showId, setShowId] = useState(shows[0]?.id || "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Card className="bd-card">
      <h2 className="font-serif text-2xl text-navy">Соберите первую серию</h2>
      <p className="mt-1 text-sm text-muted">
        Код как на диске — E03. Дальше внутри появятся сцены и шоты.
      </p>
      <ErrorText>{error}</ErrorText>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {shows.length ? (
          <Field label="Проект">
            <Select value={showId} onChange={(e) => setShowId(e.target.value)}>
              {shows.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Field label="Код">
          <Input value={code} onChange={(e) => setCode(e.target.value)} />
        </Field>
        <Field label="Название">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Название серии" />
        </Field>
      </div>
      <div className="mt-4">
        <Button
          disabled={busy || !code.trim() || !name.trim()}
          onClick={async () => {
            setBusy(true);
            setError("");
            const res = await fetch("/api/prod/breakdown", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "createEpisode", showId, code, name }),
            });
            const data = await res.json().catch(() => ({}));
            setBusy(false);
            if (!res.ok) setError(data.error || "Не удалось");
            else router.refresh();
          }}
        >
          Открыть разбивку
        </Button>
      </div>
    </Card>
  );
}
