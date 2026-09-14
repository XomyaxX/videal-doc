import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { STAGE_LABEL, ANIM_STAGES, MODEL_STAGES, canApproveProdTask, canLeadProd } from "@/lib/prod";
import { AI_WORK_STAGES, pipelineKindLabel, taskPipelineKind, userPipelineKinds } from "@/lib/prod-kinds";
import { ASSIGNED_BY_SELECT, taskListWhere, taskTitle } from "@/lib/prod-server";
import { pairNames } from "@/lib/names";
import { fmtDate } from "@/lib/dates";
import { BoardKanban, type BoardCard, type BoardCol } from "./BoardKanban";

const COLS: BoardCol[] = [
  { id: "todo", stripe: "bg-[var(--st-todo)]", well: "bg-[var(--st-todo-bg)]" },
  { id: "wip", stripe: "bg-[var(--st-wip)]", well: "bg-[var(--st-wip-bg)]" },
  { id: "revise", stripe: "bg-[var(--st-revise)]", well: "bg-[var(--st-revise-bg)]" },
  { id: "blocked", stripe: "bg-[var(--st-blocked)]", well: "bg-[var(--st-blocked-bg)]" },
  { id: "done", stripe: "bg-[var(--st-done)]", well: "bg-[var(--st-done-bg)]" },
  { id: "approved", stripe: "bg-[var(--st-approved)]", well: "bg-[var(--st-approved-bg)]" },
];

const NA_COL: BoardCol = { id: "na", stripe: "bg-[var(--st-na)]", well: "bg-[var(--st-na-bg)]" };

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
  const lead = canLeadProd(user);
  const scope = lead ? "dept" : "mine";
  const tasks = await prisma.task.findMany({
    where: {
      ...taskListWhere(user, scope),
      ...(stages ? { stage: { in: [...stages] } } : {}),
    },
    include: {
      assignee: { include: { department: true } },
      helper: true,
      assignedBy: { select: ASSIGNED_BY_SELECT },
      shot: true,
      scene: { include: { episode: { include: { show: { select: { pipelineKind: true } } } } } },
      asset: { include: { episode: { include: { show: { select: { pipelineKind: true } } } } } },
      episode: { include: { show: { select: { pipelineKind: true } } } },
    },
    orderBy: [{ dueAt: "asc" }, { updatedAt: "desc" }],
    take: 400,
  });
  const showNa = tasks.some((t) => t.status === "na");
  const columns = showNa ? [...COLS, NA_COL] : COLS;
  const cards: BoardCard[] = tasks.map((t) => ({
    id: t.id,
    status: t.status,
    stageLabel: STAGE_LABEL[t.stage] || t.stage,
    kindLabel: pipelineKindLabel(taskPipelineKind(t)) || "",
    title: taskTitle(t),
    assignee: pairNames(t.assignee, t.helper),
    canApprove: canApproveProdTask(user, t),
    due: t.dueAt ? fmtDate(t.dueAt) : "",
  }));

  return (
    <div className="-mx-4 md:-mx-6">
      <div className="px-4 md:px-6">
        <PageHeader
          title="Доска"
          subtitle={
            lead
              ? "Задачи отдела по статусам. Перетащите карточку, чтобы сменить статус."
              : "Только задачи, назначенные на вас."
          }
        />
        <div className="mb-4 flex flex-wrap gap-2">
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
      </div>
      <BoardKanban columns={columns} initial={cards} canLead={lead} />
    </div>
  );
}

function tabCls(on: boolean) {
  return `rounded-xl px-3 py-2 text-sm font-semibold ${on ? "bg-navy !text-white" : "border border-line bg-white text-navy"}`;
}
