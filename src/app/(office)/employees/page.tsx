import Link from "next/link";
import { requirePermission, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Button, Card, Empty, PageHeader, Pill } from "@/components/ui";
import { Avatar } from "@/components/Avatar";
import { WriteChatButton } from "./WriteChatButton";
import { fullName } from "@/lib/names";
import { genderLabel } from "@/lib/gender";
import { fmtBirth, officeYmd, utcMonthDay } from "@/lib/dates";
import { USER_SAFE_SELECT } from "@/lib/user-public";

function empHref(opts: { q?: string; dept?: string; role?: string }) {
  const p = new URLSearchParams();
  if (opts.q) p.set("q", opts.q);
  if (opts.dept) p.set("dept", opts.dept);
  if (opts.role) p.set("role", opts.role);
  const s = p.toString();
  return s ? `/employees?${s}` : "/employees";
}

type PersonCard = {
  id: string;
  login: string;
  lastName: string;
  firstName: string;
  middleName: string;
  gender: string;
  photoFileId: string;
  phone: string;
  status: string;
  birthDate: Date | null;
  role: { name: string };
  department: { name: string } | null;
  position: { name: string } | null;
};

function EmployeeCard({
  p,
  meId,
  manage,
  leaving,
  clearanceId,
}: {
  p: PersonCard;
  meId: string;
  manage: boolean;
  leaving?: boolean;
  clearanceId?: string;
}) {
  const today = officeYmd().slice(5);
  return (
    <Link href={`/employees/${p.id}`}>
      <Card className="hover:border-gold">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <Avatar photoFileId={p.photoFileId} lastName={p.lastName} firstName={p.firstName} size={48} />
            <div className="min-w-0">
              <div className="font-serif text-xl text-navy">{fullName(p)}</div>
              <div className="text-sm text-muted">
                {p.position?.name || "без должности"}
                {p.department ? ` · ${p.department.name}` : ""}
                {p.gender ? ` · ${genderLabel(p.gender)}` : ""}
              </div>
              {p.id !== meId ? (
                <div className="mt-2">
                  <WriteChatButton userId={p.id} />
                </div>
              ) : null}
              {manage ? (
                <>
                  <div className="mt-1 text-sm">{p.phone || "телефон не указан"}</div>
                  {p.birthDate ? (
                    <div className="mt-1 text-sm text-muted">
                      день рождения {fmtBirth(p.birthDate)}
                      {utcMonthDay(p.birthDate) === today ? " · сегодня" : ""}
                    </div>
                  ) : null}
                </>
              ) : null}
              {clearanceId ? (
                <div className="mt-2">
                  <span className="text-sm font-semibold text-navy underline">Обходной лист</span>
                </div>
              ) : null}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Pill tone={p.status === "active" ? "ok" : "draft"}>{p.role.name}</Pill>
            {leaving ? (
              <Pill tone={p.status === "dismissed" ? "draft" : "wait"}>
                {p.status === "dismissed" ? "уволен" : "увольнение"}
              </Pill>
            ) : null}
            {p.birthDate && utcMonthDay(p.birthDate) === today ? <Pill tone="wait">день рождения</Pill> : null}
          </div>
        </div>
      </Card>
    </Link>
  );
}

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; dept?: string; role?: string }>;
}) {
  const user = await requirePermission("users.view");
  const manage = can(user, "users.manage");
  const sp = await searchParams;
  const q = (sp.q || "").trim();
  const dept = (sp.dept || "").trim();
  const role = (sp.role || "").trim();

  const [departments, people, openSheets] = await Promise.all([
    prisma.department.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
    prisma.user.findMany({
      where: {
        deletedAt: null,
        ...(dept ? { departmentId: dept } : {}),
        ...(role === "remote" ? { role: { code: "remote" } } : {}),
        ...(q
          ? {
              OR: [
                { lastName: { contains: q } },
                { firstName: { contains: q } },
                { middleName: { contains: q } },
                { login: { contains: q } },
                { phone: { contains: q } },
                { position: { name: { contains: q } } },
              ],
            }
          : {}),
      },
      select: {
        ...USER_SAFE_SELECT,
        birthDate: true,
        role: { select: { name: true } },
        department: { select: { name: true } },
        position: { select: { name: true } },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.clearanceSheet.findMany({
      where: { status: "open" },
      select: { id: true, userId: true },
    }),
  ]);

  const sheetByUser = new Map(openSheets.map((s) => [s.userId, s.id]));
  const leaving = people.filter((p) => p.status === "dismissed" || sheetByUser.has(p.id));
  const working = people.filter((p) => p.status === "active" && !sheetByUser.has(p.id));

  return (
    <div>
      <PageHeader
        title="Сотрудники"
        subtitle="Люди студии. Написать — сразу в чат."
        actions={manage ? <Button href="/employees/new">Новый сотрудник</Button> : null}
      />

      <form className="mb-4 flex flex-wrap items-end gap-2" action="/employees">
        <label className="block min-w-[220px] flex-1">
          <span className="mb-1 block text-xs font-semibold text-muted">Поиск</span>
          <input
            name="q"
            defaultValue={q}
            placeholder="Фамилия, имя, логин, телефон, должность"
            className="w-full rounded-xl border border-line bg-white px-3 py-2.5"
          />
        </label>
        {dept ? <input type="hidden" name="dept" value={dept} /> : null}
        {role ? <input type="hidden" name="role" value={role} /> : null}
        <Button type="submit" variant="secondary">
          Найти
        </Button>
      </form>

      <div className="mb-6 flex flex-wrap gap-2">
        <Link
          href={empHref({ q })}
          className={`rounded-xl px-3 py-2 text-sm font-semibold ${!dept && !role ? "bg-navy !text-white" : "border border-line bg-white text-navy"}`}
        >
          Все отделы
        </Link>
        <Link
          href={empHref({ q, role: "remote" })}
          className={`rounded-xl px-3 py-2 text-sm font-semibold ${
            role === "remote" ? "bg-navy !text-white" : "border border-line bg-white text-navy"
          }`}
        >
          Дистанционные
        </Link>
        {departments.map((d) => (
          <Link
            key={d.id}
            href={empHref({ q, dept: d.id })}
            className={`rounded-xl px-3 py-2 text-sm font-semibold ${
              dept === d.id ? "bg-navy !text-white" : "border border-line bg-white text-navy"
            }`}
          >
            {d.name}
          </Link>
        ))}
      </div>

      {working.length === 0 ? (
        people.length === 0 && leaving.length === 0 ? (
          <Empty title="Никого не нашли" text={q || dept || role ? "Сбросьте поиск или выберите другой отдел." : undefined} />
        ) : leaving.length > 0 ? null : (
          <Empty title="Пока никого нет" />
        )
      ) : (
        <section>
          <div className="grid gap-3 md:grid-cols-2">
            {working.map((p) => (
              <EmployeeCard key={p.id} p={p} meId={user.id} manage={manage} />
            ))}
          </div>
        </section>
      )}

      {leaving.length > 0 ? (
        <section className="mt-10">
          <h2 className="mb-3 font-serif text-2xl text-navy">В увольнении</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {leaving.map((p) => (
              <EmployeeCard
                key={p.id}
                p={p}
                meId={user.id}
                manage={manage}
                leaving
                clearanceId={sheetByUser.get(p.id)}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
