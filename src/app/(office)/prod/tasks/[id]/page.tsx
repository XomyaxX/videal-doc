import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, PageHeader, Pill } from "@/components/ui";
import {
  STAGE_LABEL,
  STATUS_LABEL,
  STATUS_PILL,
  canApproveProdTask,
  canLeadProd,
  canSeeProdTask,
  canWorkTask,
  toUnc,
} from "@/lib/prod";
import { canSeeJob } from "@/lib/jobs";
import { ASSIGNED_BY_SELECT, taskTitle } from "@/lib/prod-server";
import { fullName, pairNames } from "@/lib/names";
import { fmtDate, officeYmd } from "@/lib/dates";
import { BriefBlock } from "../../BriefBlock";
import { TaskPanel } from "./TaskPanel";
import { DateEditor } from "./DateEditor";
import { TaskLibrary } from "./TaskLibrary";
import { TaskComments } from "./TaskComments";
import { TaskRename } from "./TaskRename";
import { TaskTrash } from "./TaskTrash";
import { TeamChat } from "@/components/TeamChat";
import { allStageSort, pipelineKindLabel, taskPipelineKind } from "@/lib/prod-kinds";
import { serializeLibrary } from "@/lib/library";
import { USER_SAFE_ORG_SELECT, USER_SAFE_SELECT } from "@/lib/user-public";

const STAGE_SORT = allStageSort();

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("prod.view");
  const { id } = await params;
  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      assignee: { select: USER_SAFE_ORG_SELECT },
      helper: { select: USER_SAFE_ORG_SELECT },
      assignedBy: { select: ASSIGNED_BY_SELECT },
      shot: true,
      scene: { include: { episode: { include: { show: { select: { pipelineKind: true, name: true } } } } } },
      asset: { include: { episode: { include: { show: { select: { pipelineKind: true, name: true } } } } } },
      episode: { include: { show: { select: { pipelineKind: true, name: true } } } },
      files: { orderBy: { createdAt: "desc" } },
      events: { include: { user: { select: USER_SAFE_SELECT } }, orderBy: { createdAt: "desc" }, take: 80 },
      job: { select: { id: true, title: true, description: true } },
      skills: { include: { skill: true } },
      libraryLinks: {
        include: {
          item: {
            include: {
              author: { select: { lastName: true, firstName: true, middleName: true } },
              files: { orderBy: { sortOrder: "asc" } },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!task) notFound();
  const pipeKind = taskPipelineKind(task);
  const pipeLabel = pipelineKindLabel(pipeKind);
  const lead = canLeadProd(user, task.stage, task.assignee?.department?.name, pipeKind);
  if (task.deletedAt && !lead) notFound();
  if (!canSeeProdTask(user, task)) {
    if (!task.jobId || !(await canSeeJob(user, task.jobId))) notFound();
  }
  const people = await prisma.user.findMany({
    where: { deletedAt: null, status: "active" },
    include: { department: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  const work = canWorkTask(user, task.assigneeId, task.helperId);
  const canApprove = canApproveProdTask(user, task);

  const siblingWhere = task.shotId
    ? { shotId: task.shotId }
    : task.assetId
      ? { assetId: task.assetId }
      : task.sceneId
        ? { sceneId: task.sceneId, shotId: null }
        : task.episodeId
          ? { episodeId: task.episodeId, sceneId: null, shotId: null, assetId: null }
          : { id: task.id };
  const siblings = (
    await prisma.task.findMany({
      where: { ...siblingWhere, deletedAt: null },
      select: {
        id: true,
        stage: true,
        status: true,
        assignee: { select: { id: true, lastName: true, firstName: true, middleName: true } },
        helper: { select: { id: true, lastName: true, firstName: true, middleName: true } },
      },
    })
  ).sort((a, b) => {
    const ia = STAGE_SORT.indexOf(a.stage as (typeof STAGE_SORT)[number]);
    const ib = STAGE_SORT.indexOf(b.stage as (typeof STAGE_SORT)[number]);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  return (
    <div>
      <PageHeader
        title={taskTitle(task)}
        subtitle={`${pipeLabel ? `${pipeLabel} · ` : ""}${STAGE_LABEL[task.stage] || task.stage}${
          task.scene?.episode?.code
            ? ` · ${task.scene.episode.code}`
            : task.asset
              ? ""
              : task.episode?.code
                ? ` · ${task.episode.code}`
                : ""
        }`}
        actions={
          <div className="flex gap-3">
            {task.job ? (
              <Link href={`/prod/jobs/${task.job.id}`} className="text-sm font-semibold text-navy hover:text-gold">
                ← {task.job.title}
              </Link>
            ) : null}
            <Link href="/prod/pipeline" className="text-sm font-semibold text-navy hover:text-gold">
              ← пайплайн
            </Link>
            <Link href="/prod" className="text-sm font-semibold text-navy hover:text-gold">
              ← мои задачи
            </Link>
          </div>
        }
      />
      {(work || lead) && !task.deletedAt ? (
        <TaskRename
          id={task.id}
          title={task.title || ""}
          fallback={taskTitle({ ...task, title: "" })}
        />
      ) : null}
      {task.deletedAt ? (
        <div className="mb-5 rounded-2xl border border-line bg-[#fff8ec] px-4 py-3">
          <p className="font-semibold text-navy">Задача удалена</p>
          <p className="text-sm text-muted">Её нет в пайплайне и в списках. Файлы на диске остались — можно восстановить.</p>
        </div>
      ) : null}
      {siblings.length > 1 ? (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          {siblings.map((s) => {
            const pill = <Pill tone={STATUS_PILL[s.status] || "draft"}>{STAGE_LABEL[s.stage] || s.stage}</Pill>;
            if (s.id === task.id) {
              return (
                <span key={s.id} className="inline-flex rounded-full ring-2 ring-gold ring-offset-2 ring-offset-[var(--paper)]">
                  {pill}
                </span>
              );
            }
            return (
              <Link key={s.id} href={`/prod/tasks/${s.id}`} className="inline-flex hover:opacity-90">
                {pill}
              </Link>
            );
          })}
        </div>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="bd-card">
          <div className="flex flex-wrap items-center gap-2">
            {pipeLabel ? <Pill tone={pipeKind === "ai" ? "wait" : "draft"}>{pipeLabel}</Pill> : null}
            <Pill tone={STATUS_PILL[task.status]}>{STATUS_LABEL[task.status]}</Pill>
            {task.startsAt ? (
              <span className="text-sm text-muted">в работе с {fmtDate(task.startsAt)}</span>
            ) : null}
            {task.dueAt ? (
              <span className="text-sm text-muted">дедлайн {fmtDate(task.dueAt)}</span>
            ) : (
              <span className="text-sm text-muted">дедлайн не проставлен</span>
            )}
          </div>
          <div className="mt-4">
            <BriefBlock
              text={task.brief}
              canEdit={lead && !task.deletedAt}
              saveUrl={`/api/prod/tasks/${task.id}`}
              field="brief"
              method="POST"
              hint={
                !task.brief && task.job?.description
                  ? "Своё ТЗ ещё не написали — ниже постановка крупной задачи."
                  : undefined
              }
            />
          </div>
          {!task.brief && task.job?.description ? (
            <p className="mt-3 whitespace-pre-wrap rounded-xl bg-paper px-3 py-2 text-sm text-navy">
              <span className="font-semibold">Крупная задача: </span>
              {task.job.description}
            </p>
          ) : null}
          {task.shot?.description ? <p className="mt-3">{task.shot.description}</p> : null}
          {task.asset?.description ? <p className="mt-3 whitespace-pre-wrap">{task.asset.description}</p> : null}
          {task.blockedReason ? (
            <p className="mt-3 rounded-xl bg-[var(--warn-bg)] px-3 py-2 text-sm">{task.blockedReason}</p>
          ) : null}
          <p className="mt-4 text-sm">
            Исполнитель:{" "}
            <span className="font-semibold">{pairNames(task.assignee, task.helper, fullName)}</span>
            {task.assigneeLocked ? <span className="ml-2 text-xs text-muted">закреплён вручную</span> : null}
          </p>
          {task.helper ? (
            <p className="mt-1 text-xs text-muted">
              Главный — {fullName(task.assignee || { lastName: "не назначен", firstName: "" })}, суб-исполнитель —{" "}
              {fullName(task.helper)}
            </p>
          ) : null}
          {task.skills.length > 0 ? (
            <p className="mt-2 text-sm text-muted">Скилы: {task.skills.map((s) => s.skill.name).join(" · ")}</p>
          ) : null}
          {task.diskDir && !work && !lead ? (
            <p className="mt-2 break-all text-xs text-muted">Папка: {toUnc(task.diskDir)}</p>
          ) : null}

          {!work && !lead ? (
            <p className="mt-4 text-sm text-muted">Эта задача на другом сотруднике — вам доступен только просмотр.</p>
          ) : null}

          {lead && !task.deletedAt ? (
            <DateEditor
              id={task.id}
              dueAt={task.dueAt ? officeYmd(task.dueAt) : ""}
              startedLabel={task.startsAt ? `В работе с ${fmtDate(task.startsAt)}` : undefined}
            />
          ) : null}
          {(work || lead) && !task.deletedAt ? (
            <div className="mt-6">
              <TaskPanel
                id={task.id}
                status={task.status}
                canLead={lead}
                canApprove={canApprove}
                canWork={work}
                people={people.map((p) => ({ id: p.id, name: fullName(p) }))}
                assigneeId={task.assigneeId || ""}
                helperId={task.helperId || ""}
                diskUnc={task.diskDir ? toUnc(task.diskDir) : ""}
              />
            </div>
          ) : null}
          {lead ? (
            <div className="mt-6 border-t border-line pt-4">
              <TaskTrash id={task.id} deleted={Boolean(task.deletedAt)} />
            </div>
          ) : null}
        </Card>
        <div className="space-y-6">
          <Card className="bd-card">
            <h2 className="font-serif text-xl text-navy">Чат задачи</h2>
            <p className="mt-1 text-sm text-muted">Только эта задача. Сообщения соседних этапов сюда не попадают.</p>
            {task.events.some((e) => e.action === "comment" && e.body) ? (
              <div className="mt-3">
                <TaskComments
                  taskId={task.id}
                  canWrite={false}
                  me={user.id}
                  comments={task.events
                    .filter((e) => e.action === "comment" && e.body)
                    .slice()
                    .reverse()
                    .map((e) => ({
                      id: e.id,
                      body: e.body,
                      createdAt: e.createdAt.toISOString(),
                      authorId: e.userId,
                      authorName: fullName(e.user),
                    }))}
                />
              </div>
            ) : null}
            <div className="mt-3">
              <TeamChat
                endpoint={`/api/prod/tasks/${task.id}/chat`}
                canWrite={(work || lead) && !task.deletedAt}
                me={user.id}
                className="h-[min(50vh,28rem)]"
                emptyText="Пока тихо. Напишите по этой задаче или киньте файл."
                lockedText="Писать могут исполнитель и руководители."
                placeholder="Сообщение по задаче"
              />
            </div>
          </Card>
          <TaskLibrary
            taskId={task.id}
            canLead={lead}
            items={task.libraryLinks
              .filter((l) => !l.item.deletedAt)
              .map((l) => serializeLibrary(l.item))}
          />
          <Card className="bd-card">
            <h2 className="font-serif text-xl text-navy">Файлы</h2>
            {task.files.length === 0 ? (
              <p className="mt-2 text-muted">Пока нет сдачи.</p>
            ) : (
              <ul className="mt-3 divide-y divide-line">
                {task.files.map((f) => (
                  <li key={f.id} className="py-2">
                    <a className="font-medium hover:text-gold" href={`/api/prod/files/${f.id}`}>
                      {f.originalName}
                    </a>
                    <div className="break-all text-xs text-muted">{f.uncPath}</div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="bd-card">
            <h2 className="font-serif text-xl text-navy">Лента</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {task.events
                .filter((e) => e.action !== "comment")
                .map((e) => (
                <li key={e.id}>
                  <span className="font-semibold">{fullName(e.user)}</span>{" "}
                  <span className="text-muted">
                    {e.action}
                    {e.toStatus ? ` → ${STATUS_LABEL[e.toStatus] || e.toStatus}` : ""}
                    {e.body ? ` · ${e.body}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
