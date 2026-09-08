import Link from "next/link";
import { requirePermission, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Button, Card, Empty, PageHeader, Pill } from "@/components/ui";
import { Avatar } from "@/components/Avatar";
import { WriteChatButton } from "./WriteChatButton";
import { fullName } from "@/lib/names";
import { fmtBirth, officeYmd, utcMonthDay } from "@/lib/dates";
import { USER_SAFE_SELECT } from "@/lib/user-public";

export default async function EmployeesPage() {
  const user = await requirePermission("users.view");
  const people = await prisma.user.findMany({
    where: { deletedAt: null },
    select: {
      ...USER_SAFE_SELECT,
      birthDate: true,
      role: { select: { name: true } },
      department: { select: { name: true } },
      position: { select: { name: true } },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  return (
    <div>
      <PageHeader
        title="Сотрудники"
        subtitle="Люди студии. Написать — сразу в чат."
        actions={can(user, "users.manage") ? <Button href="/employees/new">Новый сотрудник</Button> : null}
      />
      {people.length === 0 ? (
        <Empty title="Пока никого нет" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {people.map((p) => (
            <Link key={p.id} href={`/employees/${p.id}`}>
              <Card className="hover:border-gold">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <Avatar photoFileId={p.photoFileId} lastName={p.lastName} firstName={p.firstName} size={48} />
                    <div className="min-w-0">
                    <div className="font-serif text-xl text-navy">{fullName(p)}</div>
                    <div className="text-sm text-muted">
                      {p.position?.name || "без должности"}
                      {p.department ? ` · ${p.department.name}` : ""}
                    </div>
                    {p.id !== user.id ? (
                      <div className="mt-2">
                        <WriteChatButton userId={p.id} />
                      </div>
                    ) : null}
                    {can(user, "users.manage") ? (
                      <>
                        <div className="mt-1 text-sm">{p.phone || "телефон не указан"}</div>
                        {p.birthDate ? (
                          <div className="mt-1 text-sm text-muted">
                            день рождения {fmtBirth(p.birthDate)}
                            {utcMonthDay(p.birthDate) === officeYmd().slice(5) ? " · сегодня" : ""}
                          </div>
                        ) : null}
                      </>
                    ) : null}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Pill tone={p.status === "active" ? "ok" : "draft"}>{p.role.name}</Pill>
                    {p.birthDate && utcMonthDay(p.birthDate) === officeYmd().slice(5) ? (
                      <Pill tone="wait">день рождения</Pill>
                    ) : null}
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
