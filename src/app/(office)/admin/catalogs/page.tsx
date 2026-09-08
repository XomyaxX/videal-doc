import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { Catalogs } from "./Catalogs";

export default async function CatalogsPage() {
  await requirePermission("catalogs.manage");
  const [departments, positions] = await Promise.all([
    prisma.department.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
    prisma.position.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
  ]);
  return (
    <div>
      <PageHeader title="Отделы и должности" />
      <Catalogs departments={departments} positions={positions} />
    </div>
  );
}
