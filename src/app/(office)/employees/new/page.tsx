import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { EmployeeForm } from "../EmployeeForm";
import { fullName } from "@/lib/names";

export default async function NewEmployeePage() {
  await requirePermission("users.manage");
  const [roles, departments, positions, people, skillRows] = await Promise.all([
    prisma.role.findMany({ orderBy: { name: "asc" } }),
    prisma.department.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
    prisma.position.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { deletedAt: null, status: "active" }, orderBy: { lastName: "asc" } }),
    prisma.skill.findMany({ orderBy: { name: "asc" } }),
  ]);
  return (
    <div>
      <PageHeader title="Новый сотрудник" subtitle="Уровень доступа назначаете вы" />
      <EmployeeForm
        roles={roles}
        departments={departments}
        positions={positions}
        managers={people.map((p) => ({ id: p.id, name: fullName(p) }))}
        skills={skillRows.map((s) => ({ id: s.id, code: s.code, name: s.name, body: s.body }))}
      />
    </div>
  );
}
