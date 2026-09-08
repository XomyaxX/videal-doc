import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { isHrAddressee } from "@/lib/leaders";
import { fullName } from "@/lib/names";
import { StatementForm } from "./StatementForm";

export default async function NewStatementPage() {
  const user = await requirePermission("hrdocs.create");
  const people = await prisma.user.findMany({
    where: { deletedAt: null, status: "active" },
    include: { position: true, role: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  const managers = people.filter((p) => p.id !== user.id && isHrAddressee(p));
  const me = await prisma.user.findUnique({ where: { id: user.id } });
  const defaultManagerId = me?.managerId && managers.some((m) => m.id === me.managerId) ? me.managerId : managers[0]?.id || "";
  return (
    <div>
      <PageHeader
        title="Новое заявление"
        subtitle="Система заполняет шапку. Вам — тип, кому, даты или текст. Потом печать и скан с подписью."
      />
      <StatementForm
        managers={managers.map((m) => ({
          id: m.id,
          name: `${fullName(m)}${m.position?.name ? ` — ${m.position.name}` : ""}`,
        }))}
        defaultManagerId={defaultManagerId}
      />
    </div>
  );
}
