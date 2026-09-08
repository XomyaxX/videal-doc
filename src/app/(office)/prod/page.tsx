import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, PageHeader, Pill, Empty, Button } from "@/components/ui";
import { STAGE_LABEL, STATUS_LABEL, STATUS_PILL, canLeadProd } from "@/lib/prod";
import { taskListWhere, taskTitle } from "@/lib/prod-server";
import { fmtDate } from "@/lib/dates";
import { QuickTask } from "./QuickTask";
import { episodeProgress } from "@/lib/prod-progress";
import { ProgressBar } from "@/components/ProgressBar";
import { currentEpisodeId } from "@/lib/current-episode";
import { pipelineKindLabel, taskPipelineKind } from "@/lib/prod-kinds";
import { jobListWhere, jobProgress } from "@/lib/jobs";

export default async function MyProdPage() {
  const user = await requirePermission("prod.view");
  const tasks = await prisma.task.findMany({
    where: taskListWhere(user, "mine"),
    include: {
      shot: true,
      scene: { include: { episode: { include: { show: { select: { pipelineKind: true } } } } } },
      asset: { include: { episode: { include: { show: { select: { pipelineKind: true } } } } } },
      episode: { include: { show: { select: { pipelineKind: true } } } },
    },
    orderBy: [{ dueAt: "asc" }, { updatedAt: "desc" }],
    take: 80,
  });
  const groups: Record<string, typeof tasks> = {
    revise: [],
    blocked: [],
    wip: [],
    todo: [],
    done: [],
  };
  for (const t of tasks) {
    (groups[t.status] || (groups.todo = groups.todo || [])).push(t);
  }
  const order = ["revise", "blocked", "wip", "todo", "done"];
  const lead = canLeadProd(user);
  const epId = await currentEpisodeId(user);
  const episode = epId
    ? await prisma.episode.findUnique({
        where: { id: epId },
        include: {
          show: true,
          tasks: { where: { kind: "episode", deletedAt: null } },
          scenes: { include: { shots: { include: { tasks: { where: { deletedAt: null } } } }, tasks: { where: { deletedAt: null } } } },
          assets: { include: { tasks: { where: { deletedAt: null } } } },
        },
      })
    : null;
  const series = episode ? episodeProgress(episode) : null;
  const myJobs = await prisma.job.findMany({
    where: { status: { not: "archived" }, ...jobListWhere(user) },
    include: {
      episode: { select: { code: true } },
      tasks: { where: { deletedAt: null }, select: { stage: true, status: true, complexity: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 8,
  });

  return (
    <div>
      <PageHeader
        title="Мои задачи"
        subtitle="То, что назначено на вас. Крупные задачи, пайплайн и доска — вкладки рядом."
        actions={
          lead ? (
            <div className="flex gap-2">
              <Button href="/prod/jobs/new" variant="secondary">
                Крупная задача
              </Button>
              <Button href="/prod/new" variant="gold">
                Новая задача
              </Button>
            </div>
          ) : null
        }
      />
      {myJobs.length > 0 ? (
        <div className="mb-6 grid gap-3 md:grid-cols-2">
          {myJobs.map((j) => {
            const p = jobProgress(j.tasks);
            return (
              <Link key={j.id} href={`/prod/jobs/${j.id}`}>
                <Card className="hover:border-gold">
                  <div className="text-xs text-muted">Крупная{j.episode ? ` · ${j.episode.code}` : ""}</div>
                  <div className="font-semibold text-navy">{j.title}</div>
                  <div className="mt-2">
                    <ProgressBar value={p.pct} label={`${p.pct}%`} hint={`${p.total} подзадач`} />
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      ) : null}
      {series ? (
        <Card className="mb-6">
          <ProgressBar
            size="lg"
            value={series.pct}
            label={episode?.show.name ? `${episode.show.name} · ${episode.code}` : "Серия"}
            hint={`препродакшн ${series.preprodPct}% · сцены ${series.scenesPct}% · ассеты ${series.assetsPct}%`}
          />
        </Card>
      ) : null}
      {tasks.length === 0 ? (
        <Empty
          title="Пока ничего не назначено"
          text={lead ? "Соберите сцены на пайплайне — этапы заведутся пачкой — или создайте одну задачу." : "Когда руководитель назначит шот — он появится здесь и в календаре."}
        />
      ) : (
        <div className="space-y-8">
          {order.map((st) =>
            groups[st]?.length ? (
              <section key={st}>
                <h2 className="mb-3 font-serif text-xl text-navy">
                  {STATUS_LABEL[st]} · {groups[st].length}
                </h2>
                <div className="grid gap-3 md:grid-cols-2">
                  {groups[st].map((t) => (
                    <Card key={t.id} className="hover:border-gold">
                      <Link href={`/prod/tasks/${t.id}`} className="block">
                        <div className="flex flex-wrap items-center gap-2">
                          {pipelineKindLabel(taskPipelineKind(t)) ? (
                            <Pill tone={taskPipelineKind(t) === "ai" ? "wait" : "draft"}>
                              {pipelineKindLabel(taskPipelineKind(t))}
                            </Pill>
                          ) : null}
                          <Pill tone={STATUS_PILL[t.status]}>{STAGE_LABEL[t.stage]}</Pill>
                          <span className="font-semibold">{taskTitle(t)}</span>
                        </div>
                        <p className="mt-2 text-sm text-muted">
                          {t.startsAt || t.dueAt
                            ? `${t.startsAt ? fmtDate(t.startsAt) : "…"} → ${t.dueAt ? fmtDate(t.dueAt) : "без срока"}`
                            : "срок ещё не проставлен"}
                        </p>
                      </Link>
                      <QuickTask id={t.id} status={t.status} />
                    </Card>
                  ))}
                </div>
              </section>
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}
