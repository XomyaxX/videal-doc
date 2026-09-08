import { STAGE_LABEL, STAGE_WEIGHT } from "./prod";

export type ProgressTask = {
  id: string;
  stage: string;
  status: string;
  complexity: number;
  assigneeId?: string | null;
};

const STATUS_FRAC: Record<string, number> = {
  todo: 0,
  blocked: 0,
  wip: 0.35,
  revise: 0.5,
  done: 0.8,
  approved: 1,
};

export function taskShare(t: ProgressTask): { weight: number; done: number } {
  if (t.status === "na") return { weight: 0, done: 0 };
  const w = (STAGE_WEIGHT[t.stage] ?? 1) * Math.max(1, t.complexity || 3);
  const frac = STATUS_FRAC[t.status] ?? 0;
  return { weight: w, done: w * frac };
}

export function pct(done: number, weight: number) {
  if (weight <= 0) return 0;
  return Math.round((100 * done) / weight);
}

function sum(tasks: ProgressTask[]) {
  let weight = 0;
  let done = 0;
  for (const t of tasks) {
    const s = taskShare(t);
    weight += s.weight;
    done += s.done;
  }
  return { weight, done, pct: pct(done, weight) };
}

export type ShotProgress = {
  id: string;
  code: string;
  location?: string;
  pct: number;
  weight: number;
  done: number;
  stages: { stage: string; label: string; status: string; pct: number; taskId: string }[];
};

export type SceneProgress = {
  id: string;
  code: string;
  title: string;
  pct: number;
  weight: number;
  done: number;
  share: number;
  shots: ShotProgress[];
};

export type AssetProgress = {
  id: string;
  name: string;
  kind: string;
  pct: number;
  weight: number;
  done: number;
  stages: { stage: string; label: string; status: string; pct: number; taskId: string }[];
};

export type StageProgress = {
  stage: string;
  label: string;
  pct: number;
  weight: number;
  done: number;
  count: number;
};

export type EpisodeProgress = {
  pct: number;
  weight: number;
  done: number;
  scenesPct: number;
  assetsPct: number;
  preprodPct: number;
  scenesWeight: number;
  assetsWeight: number;
  preprodWeight: number;
  stages: StageProgress[];
  scenes: SceneProgress[];
  characters: AssetProgress[];
  locations: AssetProgress[];
  preprod: { stage: string; label: string; status: string; pct: number; taskId: string }[];
};

function stageBits(tasks: ProgressTask[]) {
  return tasks
    .filter((t) => t.status !== "na")
    .map((t) => {
      const s = taskShare(t);
      return {
        stage: t.stage,
        label: STAGE_LABEL[t.stage] || t.stage,
        status: t.status,
        pct: pct(s.done, s.weight),
        taskId: t.id,
      };
    });
}

export function episodeProgress(episode: {
  tasks?: ProgressTask[];
  scenes: {
    id: string;
    code: string;
    title: string;
    tasks: ProgressTask[];
    shots: { id: string; code: string; location?: string; tasks: ProgressTask[] }[];
  }[];
  assets: { id: string; name: string; kind: string; tasks: ProgressTask[] }[];
}): EpisodeProgress {
  const scenes: SceneProgress[] = episode.scenes.map((sc) => {
    const shots: ShotProgress[] = sc.shots.map((sh) => {
      const tot = sum(sh.tasks);
      return {
        id: sh.id,
        code: sh.code,
        location: sh.location,
        pct: tot.pct,
        weight: tot.weight,
        done: tot.done,
        stages: stageBits(sh.tasks),
      };
    });
    const sceneTasks = sum(sc.tasks);
    const shotTot = shots.reduce((a, s) => ({ weight: a.weight + s.weight, done: a.done + s.done }), { weight: 0, done: 0 });
    const weight = sceneTasks.weight + shotTot.weight;
    const done = sceneTasks.done + shotTot.done;
    return {
      id: sc.id,
      code: sc.code,
      title: sc.title,
      pct: pct(done, weight),
      weight,
      done,
      share: 0,
      shots,
    };
  });

  const assetRows: AssetProgress[] = episode.assets.map((a) => {
    const tot = sum(a.tasks);
    return {
      id: a.id,
      name: a.name,
      kind: a.kind,
      pct: tot.pct,
      weight: tot.weight,
      done: tot.done,
      stages: stageBits(a.tasks),
    };
  });
  const characters = assetRows.filter((a) => a.kind === "character");
  const locations = assetRows.filter((a) => a.kind !== "character");

  const preprodTasks = episode.tasks || [];
  const preprodTot = sum(preprodTasks);
  const preprod = stageBits(preprodTasks);

  const scenesWeight = scenes.reduce((s, x) => s + x.weight, 0);
  const scenesDone = scenes.reduce((s, x) => s + x.done, 0);
  const assetsWeight = assetRows.reduce((s, x) => s + x.weight, 0);
  const assetsDone = assetRows.reduce((s, x) => s + x.done, 0);
  const weight = scenesWeight + assetsWeight + preprodTot.weight;
  const done = scenesDone + assetsDone + preprodTot.done;

  for (const sc of scenes) {
    sc.share = weight > 0 ? Math.round((100 * sc.weight) / weight) : 0;
  }

  const byStage = new Map<string, ProgressTask[]>();
  for (const t of preprodTasks) (byStage.get(t.stage) || byStage.set(t.stage, []).get(t.stage)!).push(t);
  for (const sc of episode.scenes) {
    for (const t of sc.tasks) (byStage.get(t.stage) || byStage.set(t.stage, []).get(t.stage)!).push(t);
    for (const sh of sc.shots) {
      for (const t of sh.tasks) (byStage.get(t.stage) || byStage.set(t.stage, []).get(t.stage)!).push(t);
    }
  }
  for (const a of episode.assets) {
    for (const t of a.tasks) (byStage.get(t.stage) || byStage.set(t.stage, []).get(t.stage)!).push(t);
  }
  const stages: StageProgress[] = [...byStage.entries()]
    .map(([stage, tasks]) => {
      const tot = sum(tasks);
      return {
        stage,
        label: STAGE_LABEL[stage] || stage,
        pct: tot.pct,
        weight: tot.weight,
        done: tot.done,
        count: tasks.filter((t) => t.status !== "na").length,
      };
    })
    .filter((s) => s.weight > 0)
    .sort((a, b) => b.weight - a.weight);

  return {
    pct: pct(done, weight),
    weight,
    done,
    scenesPct: pct(scenesDone, scenesWeight),
    assetsPct: pct(assetsDone, assetsWeight),
    preprodPct: preprodTot.pct,
    scenesWeight,
    assetsWeight,
    preprodWeight: preprodTot.weight,
    stages,
    scenes,
    characters,
    locations,
    preprod,
  };
}
