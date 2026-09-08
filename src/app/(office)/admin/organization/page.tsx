import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { OrgForm } from "./OrgForm";

export default async function OrgPage() {
  await requirePermission("org.edit");
  const org = await prisma.organization.findFirst();
  if (!org) return <p>Организация не создана. Перезапустите seed.</p>;
  return (
    <div>
      <PageHeader title="Организация" subtitle="Реквизиты попадают в АО-1, заявления и кадровые бланки" />
      <OrgForm org={org} />
    </div>
  );
}
