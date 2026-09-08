import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { PERMISSIONS, parsePermissions } from "@/lib/permissions";
import { RolesEditor } from "./RolesEditor";

export default async function RolesPage() {
  await requirePermission("roles.manage");
  const roles = await prisma.role.findMany({ orderBy: { name: "asc" } });
  return (
    <div>
      <PageHeader title="Роли и уровни доступа" subtitle="Галочки решают, что видит сотрудник" />
      <RolesEditor
        permissions={[...PERMISSIONS]}
        roles={roles.map((r) => ({
          id: r.id,
          code: r.code,
          name: r.name,
          description: r.description,
          isSystem: r.isSystem,
          permissions: parsePermissions(r.permissions),
        }))}
      />
    </div>
  );
}
