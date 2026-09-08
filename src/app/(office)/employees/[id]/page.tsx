import { notFound } from "next/navigation";
import { requirePermission, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Button, Card, PageHeader } from "@/components/ui";
import { Avatar } from "@/components/Avatar";
import { EmployeeForm } from "../EmployeeForm";
import { fullName } from "@/lib/names";
import { ResetPassword } from "./ResetPassword";
import { WriteChatButton } from "../WriteChatButton";
import { canViewArchive } from "@/lib/archive-access";
import { USER_SAFE_SELECT } from "@/lib/user-public";

export default async function EmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("users.view");
  const { id } = await params;
  const person = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: {
      ...USER_SAFE_SELECT,
      smtpPassword: true,
      personnelNumber: true,
      inn: true,
      hiredAt: true,
      birthDate: true,
      roleId: true,
      departmentId: true,
      positionId: true,
      managerId: true,
      role: { select: { id: true, code: true, name: true } },
      department: { select: { id: true, name: true } },
      position: { select: { id: true, name: true } },
      skills: { include: { skill: true } },
    },
  });
  if (!person) notFound();
  const manage = can(user, "users.manage");
  const [roles, departments, positions, people, skillRows] = manage
    ? await Promise.all([
        prisma.role.findMany({ orderBy: { name: "asc" } }),
        prisma.department.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
        prisma.position.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
        prisma.user.findMany({
          where: { deletedAt: null, status: "active", id: { not: id } },
          select: USER_SAFE_SELECT,
        }),
        prisma.skill.findMany({ orderBy: { name: "asc" } }),
      ])
    : [[], [], [], [], []];

  const archiveOk = canViewArchive(user, person);

  return (
    <div>
      <div className="mb-4 flex items-center gap-4">
        <Avatar photoFileId={person.photoFileId} lastName={person.lastName} firstName={person.firstName} size={72} gold />
        <div className="min-w-0 flex-1">
      <PageHeader
        title={fullName(person)}
        subtitle={`${person.role.name} · ${person.login}`}
        actions={
          <span className="flex flex-wrap gap-2">
            {person.id !== user.id ? <WriteChatButton userId={person.id} className="rounded-xl border border-line bg-white px-4 py-2.5 text-[15px] font-semibold text-navy" /> : null}
            {archiveOk ? (
              <Button href={`/archive?user=${person.id}`} variant="secondary">
                Документы сотрудника
              </Button>
            ) : null}
          </span>
        }
      />
        </div>
      </div>
      {manage ? (
        <>
          <EmployeeForm
            roles={roles}
            departments={departments}
            positions={positions}
            managers={people.map((p) => ({ id: p.id, name: fullName(p) }))}
            skills={(skillRows as { id: string; code: string; name: string; body: string }[]).map((s) => ({
              id: s.id,
              code: s.code,
              name: s.name,
              body: s.body,
            }))}
            initialSkillIds={person.skills.map((x) => x.skillId)}
            initial={{
              id: person.id,
              lastName: person.lastName,
              firstName: person.firstName,
              middleName: person.middleName,
              phone: person.phone,
              email: person.email,
              hasSmtpPassword: person.smtpPassword ? "1" : "",
              login: person.login,
              positionId: person.positionId || "",
              departmentId: person.departmentId || "",
              roleId: person.roleId,
              managerId: person.managerId || "",
              personnelNumber: person.personnelNumber,
              inn: person.inn,
              hiredAt: person.hiredAt ? person.hiredAt.toISOString().slice(0, 10) : "",
              birthDate: person.birthDate ? person.birthDate.toISOString().slice(0, 10) : "",
              status: person.status,
            }}
          />
          <div className="mt-6">
            <ResetPassword id={person.id} />
          </div>
        </>
      ) : (
        <Card>
          <dl className="grid gap-3 sm:grid-cols-2">
            <Item k="Должность" v={person.position?.name} />
            <Item k="Отдел" v={person.department?.name} />
            <Item k="Скилы" v={person.skills.map((x) => x.skill.name).join(", ") || "не отмечены"} />
          </dl>
        </Card>
      )}
    </div>
  );
}

function Item({ k, v }: { k: string; v?: string | null }) {
  return (
    <div>
      <dt className="text-xs uppercase text-muted">{k}</dt>
      <dd>{v || "—"}</dd>
    </div>
  );
}
