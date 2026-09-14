import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { canLeadProd } from "@/lib/prod";
import { specForKind, userPipelineKinds } from "@/lib/prod-kinds";
import { fullName } from "@/lib/names";
import { PipelineScheme } from "./Scheme";
import { episodeProgress } from "@/lib/prod-progress";
import { currentEpisodeId } from "@/lib/current-episode";
import { EpisodePicker } from "./EpisodePicker";
import { BreakdownBoard, EmptyEpisodeStart, type TaskChip } from "./BreakdownBoard";

const taskChipInclude = {
  assignee: { select: { id: true, lastName: true, firstName: true, middleName: true } },
  shot: { select: { code: true } },
  scene: { select: { code: true, title: true } },
  asset: { select: { name: true } },
};

function chip(t: {
  id: string;
  kind: string;
  stage: string;
  status: string;
  title: string;
  dueAt: Date | null;
  blockedReason: string;
  assigneeId: string | null;
  assignee: { lastName: string; firstName: string; middleName: string | null } | null;
  shot: { code: string } | null;
  scene: { code: string; title: string } | null;
  asset: { name: string } | null;
}): TaskChip {
  return {
    id: t.id,
    kind: t.kind,
    stage: t.stage,
    status: t.status,
    title: t.title,
    dueAt: t.dueAt ? t.dueAt.toISOString() : null,
    blockedReason: t.blockedReason,
    assigneeId: t.assigneeId,
    assigneeName: t.assignee ? fullName(t.assignee) : null,
    shotCode: t.shot?.code || null,
    sceneCode: t.scene?.code || null,
    sceneTitle: t.scene?.title || null,
    assetName: t.asset?.name || null,
  };
}

export default async function ProdPipelinePage() {
  const user = await requirePermission("prod.view");
  const skilled = await prisma.user.findMany({
    where: { deletedAt: null, status: "active" },
    include: { skills: { include: { skill: true } } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  const people = skilled.map((p) => ({
    id: p.id,
    name: fullName(p),
    skillCodes: p.skills.map((s) => s.skill.code),
  }));
  const kinds = userPipelineKinds(user);
  const shows = await prisma.show.findMany({
    where: kinds.length ? { pipelineKind: { in: kinds } } : { id: "__none__" },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, pipelineKind: true },
  });
  const episodes = await prisma.episode.findMany({
    where: kinds.length ? { show: { pipelineKind: { in: kinds } } } : { id: "__none__" },
    include: { show: true },
    orderBy: { createdAt: "asc" },
  });
  const epId = await currentEpisodeId(user);
  const episode = epId
    ? await prisma.episode.findUnique({
        where: { id: epId },
        include: {
          show: true,
          tasks: { where: { kind: "episode", deletedAt: null }, include: taskChipInclude },
          scenes: {
            orderBy: { sortOrder: "asc" },
            include: {
              shots: { orderBy: { sortOrder: "asc" }, include: { tasks: { where: { deletedAt: null }, include: taskChipInclude } } },
              tasks: { where: { deletedAt: null }, include: taskChipInclude },
            },
          },
          assets: { orderBy: { sortOrder: "asc" }, include: { tasks: { where: { deletedAt: null }, include: taskChipInclude } } },
        },
      })
    : null;
  const kind = episode?.show.pipelineKind || (kinds[0] || "e02");
  const spec = specForKind(kind);
  const lead = canLeadProd(user, undefined, null, kind);

  const picker =
    episodes.length > 0 ? (
      <EpisodePicker
        episodes={episodes.map((e) => ({
          id: e.id,
          label: `${e.show.name} · ${e.code}${e.show.pipelineKind === "ai" ? " · ИИ" : ""}`,
        }))}
        currentId={epId || ""}
      />
    ) : null;

  if (!episode) {
    return (
      <div>
        <PageHeader
          title="Пайплайн серии"
          subtitle={
            spec.kind === "ai"
              ? "ИИ-мультфильм: сценарий → раскадровка → концепт → кадр → генерация → монтаж."
              : "Разбивка как на площадке: серия → сцены → шоты. Этапы заводятся пачкой."
          }
          actions={picker}
        />
        {lead ? <EmptyEpisodeStart shows={shows} /> : null}
        <details className="mt-8">
          <summary className="cursor-pointer font-serif text-xl text-navy">Схема скилов</summary>
          <div className="mt-4">
            <PipelineScheme people={people} />
          </div>
        </details>
      </div>
    );
  }

  const progress = episodeProgress(episode);
  const sceneById = new Map(progress.scenes.map((s) => [s.id, s]));
  const shotById = new Map(progress.scenes.flatMap((s) => s.shots.map((sh) => [sh.id, sh] as const)));

  return (
    <div>
      <PageHeader
        title="Пайплайн серии"
        subtitle={
          spec.kind === "ai"
            ? `${spec.label}. Серия → сцены → шоты. Сценарий, раскадровка, концепт, монтаж — на серию; кадр и генерация — на шот.`
            : "Серия → сцены → шоты. Нехватающие этапы заводятся сразу, как лист разбивки в студии."
        }
        actions={picker}
      />

      <BreakdownBoard
        canEdit={lead}
        people={people}
        shows={shows}
        episode={{
          id: episode.id,
          code: episode.code,
          name: episode.name,
          showName: episode.show.name,
          pipelineKind: episode.show.pipelineKind,
          pct: progress.pct,
          scenesPct: progress.scenesPct,
          assetsPct: progress.assetsPct,
          preprodPct: progress.preprodPct,
          scenesShare: progress.scenesShare,
          assetsShare: progress.assetsShare,
          preprodShare: progress.preprodShare,
          slices: progress.slices,
          tasks: episode.tasks.map(chip),
          scenes: episode.scenes.map((scene) => ({
            id: scene.id,
            code: scene.code,
            title: scene.title,
            locationNote: scene.locationNote,
            charactersNote: scene.charactersNote,
            pct: sceneById.get(scene.id)?.pct ?? 0,
            share: sceneById.get(scene.id)?.share ?? 0,
            sortOrder: scene.sortOrder,
            tasks: scene.tasks.map(chip),
            shots: scene.shots.map((shot) => ({
              id: shot.id,
              code: shot.code,
              location: shot.location,
              description: shot.description,
              pct: shotById.get(shot.id)?.pct ?? 0,
              sortOrder: shot.sortOrder,
              tasks: shot.tasks.map(chip),
            })),
          })),
          assets: episode.assets.map((a) => ({
            id: a.id,
            name: a.name,
            kind: a.kind,
            groupName: a.groupName,
            sortOrder: a.sortOrder,
            pct:
              [...progress.characters, ...progress.locations].find((x) => x.id === a.id)?.pct ?? 0,
            tasks: a.tasks.map(chip),
          })),
        }}
      />

      <details className="mt-10">
        <summary className="cursor-pointer font-serif text-xl text-navy">Схема скилов — кто за кем</summary>
        <div className="mt-4">
          <PipelineScheme people={people} />
        </div>
      </details>
    </div>
  );
}
