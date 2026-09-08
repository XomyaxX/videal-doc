import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Button, Card, PageHeader, Pill } from "@/components/ui";
import { STAGE_LABEL, STATUS_LABEL, STATUS_PILL, canLeadProd } from "@/lib/prod";
import { canSeeJob, canWriteJob, jobProgress } from "@/lib/jobs";
import { taskTitle } from "@/lib/prod-server";
import { ProgressBar } from "@/components/ProgressBar";
import { fullName } from "@/lib/names";
import { fmtDate } from "@/lib/dates";
import { JobChat } from "./JobChat";
import { JobSubtasks } from "./JobSubtasks";
import { JobTeam } from "./JobTeam";
import { JobTrash } from "./JobTrash";
import { USER_SAFE_SELECT } from "@/lib/user-public";

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("prod.view");
  const { id } = await params;
  if (!(await canSeeJob(user, id))) notFound();
  const job = await prisma.job.findUnique({
    where: { id },
    include: {
      author: { select: USER_SAFE_SELECT },
      episode: true,
      members: {
        include: {
          user: {
            select: {
              ...USER_SAFE_SELECT,
              skills: { include: { skill: true } },
            },
          },
        },
      },
      tasks: {
        where: { deletedAt: null },
        include: {
          assignee: { select: USER_SAFE_SELECT },
          shot: true,
          scene: true,
          asset: true,
          skills: { include: { skill: true } },
        },
        orderBy: [{ status: "asc" }, { createdAt: "asc" }],
      },
    },
  });
  if (!job) notFound();
  const lead = canLeadProd(user);
  const write = await canWriteJob(user, id);
  const progress = jobProgress(job.tasks);
  const people = lead
    ? await prisma.user.findMany({
        where: { deletedAt: null, status: "active" },
        include: { skills: { include: { skill: true } } },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      })
    : [];
  const skills = lead ? await prisma.skill.findMany({ orderBy: { name: "asc" } }) : [];

  return (
    <div>
      <PageHeader
        title={job.title}
        subtitle={job.description}
        actions={
          <div className="flex gap-2">
            <Button href="/prod/jobs" variant="secondary">
              К крупным
            </Button>
          </div>
        }
      />
      {job.deletedAt ? (
        <div className="mb-5 rounded-2xl border border-line bg-[#fff8ec] px-4 py-3">
          <p className="font-semibold text-navy">Крупная задача удалена</p>
          <p className="text-sm text-muted">Её нет в списках. Файлы и чат на диске остались — можно восстановить.</p>
        </div>
      ) : null}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Pill tone={job.status === "done" ? "ok" : "wait"}>{job.status === "done" ? "Готово" : "В работе"}</Pill>
        {job.episode ? <span className="text-sm text-muted">{job.episode.code} · {job.episode.name}</span> : null}
        {job.dueAt ? <span className="text-sm text-muted">до {fmtDate(job.dueAt)}</span> : null}
      </div>
      <Card className="mb-6">
        <ProgressBar
          size="lg"
          value={progress.pct}
          label={`${progress.pct}%`}
          hint={`${progress.total} подзадач · открыто ${progress.open} · команда ${job.members.length}`}
        />
      </Card>
      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-4">
          <Card>
            <h2 className="font-serif text-xl text-navy">Команда</h2>
            <ul className="mt-3 space-y-1 text-sm">
              {job.members.map((m) => (
                <li key={m.userId}>
                  <span className="font-semibold">{fullName(m.user)}</span>
                  {m.user.skills.length ? (
                    <span className="text-muted"> · {m.user.skills.map((s) => s.skill.name).join(", ")}</span>
                  ) : null}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted">Завёл {fullName(job.author)}</p>
            <div className="mt-3">
              <JobTeam
                jobId={job.id}
                selected={job.members.map((m) => m.userId)}
                canLead={lead && !job.deletedAt}
                people={people.map((p) => ({
                  id: p.id,
                  name: fullName(p),
                  skillNames: p.skills.map((s) => s.skill.name),
                }))}
              />
            </div>
          </Card>
          <Card>
            <h2 className="font-serif text-xl text-navy">Подзадачи</h2>
            {job.tasks.length === 0 ? (
              <p className="mt-2 text-sm text-muted">Пока пусто. Руководитель добавляет и жмёт «Распределить по скилам».</p>
            ) : (
              <ul className="mt-3 divide-y divide-line">
                {job.tasks.map((t) => (
                  <li key={t.id} className="py-2">
                    <Link href={`/prod/tasks/${t.id}`} className="font-semibold text-navy hover:text-gold">
                      {taskTitle(t)}
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      <Pill tone={STATUS_PILL[t.status]}>{STATUS_LABEL[t.status]}</Pill>
                      {t.kind !== "job" ? <span className="text-muted">{STAGE_LABEL[t.stage] || t.stage}</span> : null}
                      <span className="text-muted">сложность {t.complexity}</span>
                      <span className="text-muted">{t.assignee ? fullName(t.assignee) : "не назначен"}</span>
                      {t.skills.length ? (
                        <span className="text-muted">{t.skills.map((s) => s.skill.name).join(" · ")}</span>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4">
              <JobSubtasks
                jobId={job.id}
                canLead={lead && !job.deletedAt}
                skills={skills.map((s) => ({ id: s.id, code: s.code, name: s.name }))}
                people={(people.length ? people : job.members.map((m) => m.user)).map((p) => ({
                  id: p.id,
                  name: fullName(p),
                  skillNames: p.skills.map((s) => s.skill.name),
                }))}
              />
            </div>
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <h2 className="font-serif text-xl text-navy">Чат задачи</h2>
            <div className="mt-3">
              <JobChat jobId={job.id} canWrite={write && !job.deletedAt} me={user.id} />
            </div>
          </Card>
          {lead ? (
            <Card>
              <h2 className="font-serif text-xl text-navy">Удаление</h2>
              <p className="mt-1 text-sm text-muted">Скрыть из списков. Файлы на диске не трогаем.</p>
              <div className="mt-3">
                <JobTrash id={job.id} deleted={Boolean(job.deletedAt)} />
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
