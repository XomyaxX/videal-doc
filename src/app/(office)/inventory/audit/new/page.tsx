import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { fullName } from "@/lib/names";
import { AuditNewForm } from "./AuditNewForm";

export default async function NewAuditPage() {
  await requirePermission("inventory.manage");
  const people = await prisma.user.findMany({
    where: { deletedAt: null, status: "active" },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, lastName: true, firstName: true, middleName: true, department: { select: { name: true } } },
  });
  if (!people.length) redirect("/inventory");
  return (
    <div>
      <PageHeader
        title="Инвентаризация"
        subtitle="Выберите сотрудника. По каждой позиции: на месте, передать другому или не найден — в обработку."
      />
      <AuditNewForm
        people={people.map((p) => ({
          id: p.id,
          name: `${fullName(p)}${p.department?.name ? ` · ${p.department.name}` : ""}`,
        }))}
      />
    </div>
  );
}
