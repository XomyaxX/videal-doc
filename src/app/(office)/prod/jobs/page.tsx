import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Button, Card, Empty, PageHeader, Pill } from "@/components/ui";
import { canLeadProd } from "@/lib/prod";
import { jobListWhere, jobProgress } from "@/lib/jobs";
import { ProgressBar } from "@/components/ProgressBar";
import { fullName } from "@/lib/names";
import { fmtDate } from "@/lib/dates";

export default async function JobsPage() {
  const user = await requirePermission("prod.view");
  const lead = canLeadProd(user);
  const rows = await prisma.job.findMany({
    where: { status: { not: "archived" }, ...jobListWhere(user) },
    include: {
      author: { select: { lastName: true, firstName: true, middleName: true } },
      episode: { select: { code: true, name: true } },
      members: { select: { userId: true } },
      tasks: { where: { deletedAt: null }, select: { stage: true, status: true, complexity: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  return (
    <div>
      <PageHeader
        title="Крупные задачи"
        subtitle="Работа с командой, подзадачами и чатом. Этапы шотов E02 живут как раньше."
        actions={lead ? <Button href="/prod/jobs/new">Новая крупная</Button> : null}
      />
      {rows.length === 0 ? (
        <Empty
          title="Пока нет крупных задач"
          text={lead ? "Соберите работу: команда, подзадачи, раздача по скилам." : "Когда вас закрепят за работой — она появится здесь."}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((j) => {
            const p = jobProgress(j.tasks);
            return (
              <Link key={j.id} href={`/prod/jobs/${j.id}`}>
                <Card className="hover:border-gold">
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone={j.status === "done" ? "ok" : "wait"}>{j.status === "done" ? "Готово" : "В работе"}</Pill>
                    {j.episode ? <span className="text-xs text-muted">{j.episode.code}</span> : null}
                  </div>
                  <h2 className="mt-2 font-serif text-xl text-navy">{j.title}</h2>
                  {j.description ? <p className="mt-1 line-clamp-2 text-sm text-muted">{j.description}</p> : null}
                  <div className="mt-3">
                    <ProgressBar value={p.pct} label={`${p.pct}%`} hint={`${p.total} подзадач · в команде ${j.members.length}`} />
                  </div>
                  <p className="mt-2 text-xs text-muted">
                    {fullName(j.author)}
                    {j.dueAt ? ` · до ${fmtDate(j.dueAt)}` : ""}
                  </p>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
