import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, PageHeader } from "@/components/ui";
import { STAGE_LABEL, STATUS_LABEL, ANIM_STAGES, MODEL_STAGES, canLeadProd } from "@/lib/prod";
import { AI_WORK_STAGES, pipelineKindLabel, taskPipelineKind, userPipelineKinds } from "@/lib/prod-kinds";
import { taskListWhere, taskTitle } from "@/lib/prod-server";
import { fullName } from "@/lib/names";

export default async function ProdBoardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requirePermission("prod.view");
  const sp = await searchParams;
  const kinds = userPipelineKinds(user);
  const onlyAi = kinds.length === 1 && kinds[0] === "ai";
  const tab = sp.tab || (onlyAi ? "ai" : "anim");
  const stages =
    tab === "model"
      ? [...MODEL_STAGES]
      : tab === "ai"
        ? [...AI_WORK_STAGES]
        : tab === "all"
          ? undefined
          : [...ANIM_STAGES];
  const scope = canLeadProd(user) ? "dept" : "mine";
  const tasks = await prisma.task.findMany({
    where: {
      ...taskListWhere(user, scope),
      ...(stages ? { stage: { in: [...stages] } } : {}),
    },
    include: {
      assignee: true,
      shot: true,
      scene: { include: { episode: { include: { show: { select: { pipelineKind: true } } } } } },
      asset: { include: { episode: { include: { show: { select: { pipelineKind: true } } } } } },
      episode: { include: { show: { select: { pipelineKind: true } } } },
    },
    orderBy: [{ dueAt: "asc" }, { updatedAt: "desc" }],
    take: 400,
  });
  const columns = ["blocked", "revise", "todo", "wip", "done", "approved", "na"];
  const by: Record<string, typeof tasks> = Object.fromEntries(columns.map((c) => [c, []]));
  for (const t of tasks) (by[t.status] || (by[t.status] = [])).push(t);

  return (
    <div>
      <PageHeader
        title="Доска отдела"
        subtitle={canLeadProd(user) ? "Задачи отдела. Сотрудник на своей доске видит только свои." : "Только задачи, назначенные на вас."}
        actions={
          <div className="flex gap-2">
            {kinds.includes("e02") ? (
              <>
                <Link className={tabCls(tab === "anim")} href="/prod/board?tab=anim">
                  Анимация
                </Link>
                <Link className={tabCls(tab === "model")} href="/prod/board?tab=model">
                  3D
                </Link>
              </>
            ) : null}
            {kinds.includes("ai") ? (
              <Link className={tabCls(tab === "ai")} href="/prod/board?tab=ai">
                ИИ
              </Link>
            ) : null}
            <Link className={tabCls(tab === "all")} href="/prod/board?tab=all">
              Всё
            </Link>
          </div>
        }
      />
      <div className="flex gap-3 overflow-x-auto pb-4">
        {columns.map((col) => (
          <div key={col} className="w-[240px] shrink-0">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-semibold text-navy">{STATUS_LABEL[col]}</span>
              <span className="text-sm text-muted">{by[col].length}</span>
            </div>
            <div className="space-y-2">
              {by[col].map((t) => (
                <Link key={t.id} href={`/prod/tasks/${t.id}`}>
                  <Card className="p-3 hover:border-gold">
                    <div className="text-xs text-muted">
                      {pipelineKindLabel(taskPipelineKind(t))
                        ? `${pipelineKindLabel(taskPipelineKind(t))} · `
                        : ""}
                      {STAGE_LABEL[t.stage]}
                    </div>
                    <div className="font-medium leading-snug">{taskTitle(t)}</div>
                    <div className="mt-1 text-xs text-muted">
                      {t.assignee ? fullName(t.assignee) : "не назначен"}
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function tabCls(on: boolean) {
  return `rounded-xl px-3 py-2 text-sm font-semibold ${on ? "bg-navy !text-white" : "border border-line bg-white text-navy"}`;
}
