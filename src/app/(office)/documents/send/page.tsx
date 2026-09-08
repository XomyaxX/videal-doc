import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { SendForm } from "./SendForm";

export default async function SendPage() {
  await requirePermission("docs.send");
  const people = await prisma.user.findMany({
    where: { deletedAt: null, status: "active" },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, lastName: true, firstName: true, middleName: true, departmentId: true },
  });
  const departments = await prisma.department.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
  });
  return (
    <div>
      <PageHeader title="Разослать документ" subtitle="Три шага: файл, кому, что сделать" />
      <SendForm people={people} departments={departments} />
    </div>
  );
}
