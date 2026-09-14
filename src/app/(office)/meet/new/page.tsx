import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { canCreateMeet } from "@/lib/meet";
import { fullName } from "@/lib/names";
import { MeetForm } from "../MeetForm";

export default async function NewMeetPage() {
  const user = await requireUser();
  if (!canCreateMeet(user)) redirect("/meet");
  const people = await prisma.user.findMany({
    where: { deletedAt: null, status: "active" },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: {
      id: true,
      lastName: true,
      firstName: true,
      middleName: true,
      photoFileId: true,
      department: { select: { name: true } },
    },
  });
  const departments = await prisma.department.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return (
    <div>
      <PageHeader title="Созвать совещание" subtitle="Кого собрать, где, о чём и на каких файлах." />
      <MeetForm
        meId={user.id}
        departments={departments}
        people={people.map((p) => ({
          id: p.id,
          lastName: p.lastName,
          firstName: p.firstName,
          fullName: fullName(p),
          photoFileId: p.photoFileId,
          departmentName: p.department?.name || null,
        }))}
      />
    </div>
  );
}
