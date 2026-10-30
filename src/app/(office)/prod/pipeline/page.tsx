import { requirePermission } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { loadPipeDesk } from "@/lib/pipe-server";
import { PIPE_DEPT_LABEL } from "@/lib/pipe-board";
import { PipelineDesk } from "./PipelineDesk";

export default async function ProdPipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ dept?: string }>;
}) {
  const user = await requirePermission("prod.view");
  const { dept: rawDept } = await searchParams;
  const desk = await loadPipeDesk(user, rawDept);
  return (
    <div>
      <PageHeader
        title="Пайплайн"
        subtitle={`Отдел «${PIPE_DEPT_LABEL[desk.dept]}»: этапы, задачи и сетка. Суперглазка — во вкладке «Серии».`}
      />
      <PipelineDesk
        initialDept={desk.dept}
        depts={desk.depts}
        manager={desk.manager}
        me={desk.me}
        people={desk.people}
        projects={desk.projects}
      />
    </div>
  );
}
