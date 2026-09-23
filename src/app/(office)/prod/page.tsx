import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, PageHeader, Pill, Empty, Button } from "@/components/ui";
import { STAGE_LABEL, STATUS_LABEL, STATUS_PILL, canLeadProd } from "@/lib/prod";
import { taskListWhere, taskTitle } from "@/lib/prod-server";
import { fmtDate } from "@/lib/dates";
import { pairNames } from "@/lib/names";
import { QuickTask } from "./QuickTask";
import { episodeProgress } from "@/lib/prod-progress";
import { ProgressBar } from "@/components/ProgressBar";
import { currentEpisodeId } from "@/lib/current-episode";
import { pipelineKindLabel, taskPipelineKind } from "@/lib/prod-kinds";
import { jobListWhere, jobProgress } from "@/lib/jobs";
import { serializeTask } from "@/lib/chat-widgets";
import { PeerDone } from "./PeerDone";

export default async function MyProdPage() {
  const user = await requirePermission("prod.view");
  const tasks = await prisma.task.findMany({
    where: taskListWhere(user, "mine"),
    include: {
      assignee: true,
      helper: true,
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
  const peerRows = await prisma.chatTask.findMany({
    where: { assigneeId: user.id, status: { not: "done" } },
    include: {
      assignee: { select: { lastName: true, firstName: true, middleName: true } },
      author: { select: { lastName: true, firstName: true, middleName: true } },
      parent: { select: { title: true } },
      linkedJob: { select: { id: true, title: true } },
      linkedTask: {
        select: {
          id: true,
          title: true,
          stage: true,
          shot: { select: { code: true } },
          scene: { select: { code: true } },
          asset: { select: { name: true } },
        },
      },
    },
    orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
    take: 40,
  });
  const peers = peerRows.map(serializeTask);
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
        subtitle="Производство отдельно, поручения коллег — своим блоком."
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
      {peers.length > 0 ? (
        <section className="mb-8">
          <h2 className="mb-3 font-serif text-xl text-navy">Поручения · {peers.length}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {peers.map((t) => (
              <Card key={t.id} className="hover:border-gold">
                <div className="text-xs font-semibold uppercase tracking-wide text-gold">
                  {t.kindLabel || (t.parentTitle ? `Подзадача · ${t.parentTitle}` : "Поручение")}
                </div>
                <div className="mt-1 font-semibold text-navy">{t.title}</div>
                <p className="mt-1 text-sm text-muted">
                  от {t.authorName || "коллеги"}
                  {t.dueAt ? ` · к ${fmtDate(new Date(t.dueAt))}` : ""}
                </p>
                {t.linkHref ? (
                  <Link href={t.linkHref} className="mt-1 inline-block text-xs font-semibold text-gold">
                    {t.linkLabel}
                  </Link>
                ) : t.chatId ? (
                  <Link href={`/chat/${t.chatId}`} className="mt-1 inline-block text-xs font-semibold text-gold">
                    открыть в чате
                  </Link>
                ) : null}
                <PeerDone id={t.id} status={t.status} />
              </Card>
            ))}
          </div>
        </section>
      ) : (
        <p className="mb-6 text-sm text-muted">Поручений от коллег пока нет — их ставят из чата кнопкой «+».</p>
      )}
      {myJobs.length > 0 ? (
        <div className="mb-6 grid gap-3 md:grid-cols-2">
          {myJobs.map((j) => {
            const p = jobProgress(j.tasks);
            return (
              <Link key={j.id} href={`/prod/jobs/${j.id}`}>
                <Card className="hover:border-gold">
                  <div className="text-xs text-muted">Крупная{j.episode ? ` · ${j.episode.code}` : ""}</div>
                  <div className="font-semibold text-navy">{j.title}</div>
                  {j.description ? <p className="mt-1 line-clamp-2 text-sm text-muted">{j.description}</p> : null}
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
          title="В производстве пока пусто"
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
                        {t.brief ? <p className="mt-2 line-clamp-2 text-sm text-navy">{t.brief}</p> : null}
                        <p className="mt-2 text-sm text-muted">
                          {pairNames(t.assignee, t.helper)}
                          {" · "}
                          {t.startsAt || t.dueAt
                            ? `${t.startsAt ? fmtDate(t.startsAt) : "…"} → ${t.dueAt ? fmtDate(t.dueAt) : "без срока"}`
                            : "срок ещё не проставлен"}
                        </p>
                      </Link>
                      {t.assigneeId === user.id || t.helperId === user.id ? <QuickTask id={t.id} status={t.status} /> : null}
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
