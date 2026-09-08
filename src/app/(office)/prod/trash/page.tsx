import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, PageHeader, Pill } from "@/components/ui";
import { STAGE_LABEL, STATUS_LABEL, STATUS_PILL, canLeadProd } from "@/lib/prod";
import { taskTitle } from "@/lib/prod-server";
import { fmtDateTime } from "@/lib/dates";
import { TaskTrash } from "../tasks/[id]/TaskTrash";
import { JobTrash } from "../jobs/[id]/JobTrash";
import { redirect } from "next/navigation";

export default async function ProdTrashPage() {
  const user = await requirePermission("prod.view");
  if (!canLeadProd(user)) redirect("/prod");
  const [tasks, jobs] = await Promise.all([
    prisma.task.findMany({
      where: { deletedAt: { not: null } },
      include: { shot: true, scene: true, asset: true, episode: true },
      orderBy: { deletedAt: "desc" },
      take: 200,
    }),
    prisma.job.findMany({
      where: { deletedAt: { not: null } },
      include: { episode: { select: { code: true } } },
      orderBy: { deletedAt: "desc" },
      take: 100,
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Удалённые задачи"
        subtitle="Скрыты из списков. Файлы на диске на месте. Восстановление возвращает карточку."
      />
      <h2 className="mb-3 font-serif text-2xl text-navy">Крупные</h2>
      {jobs.length === 0 ? (
        <Card className="mb-8">Нет удалённых крупных задач.</Card>
      ) : (
        <ul className="mb-8 space-y-2">
          {jobs.map((j) => (
            <li key={j.id}>
              <Card className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/prod/jobs/${j.id}`} className="font-semibold text-navy hover:text-gold">
                    {j.title}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
                    {j.episode ? <span>{j.episode.code}</span> : null}
                    {j.deletedAt ? <span>убрали {fmtDateTime(j.deletedAt)}</span> : null}
                  </div>
                </div>
                <JobTrash id={j.id} deleted compact />
              </Card>
            </li>
          ))}
        </ul>
      )}
      <h2 className="mb-3 font-serif text-2xl text-navy">Этапы пайплайна</h2>
      {tasks.length === 0 ? (
        <Card>Нет удалённых этапов.</Card>
      ) : (
        <ul className="space-y-2">
          {tasks.map((t) => (
            <li key={t.id}>
              <Card className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/prod/tasks/${t.id}`} className="font-semibold text-navy hover:text-gold">
                    {taskTitle(t)}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
                    <Pill tone={STATUS_PILL[t.status] || "draft"}>{STAGE_LABEL[t.stage] || t.stage}</Pill>
                    <span>{STATUS_LABEL[t.status] || t.status}</span>
                    {t.deletedAt ? <span>убрали {fmtDateTime(t.deletedAt)}</span> : null}
                  </div>
                </div>
                <TaskTrash id={t.id} deleted compact />
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
