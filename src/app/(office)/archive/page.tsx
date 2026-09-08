import Link from "next/link";
import { requireUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Button, Card, Empty, PageHeader, Pill } from "@/components/ui";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import { fullName } from "@/lib/names";
import { ARCHIVE_KIND_LABEL, ARCHIVE_KIND_TONE, canViewArchive } from "@/lib/archive-access";
import { toUnc, shareRoot } from "@/lib/prod";
import { MailButton } from "./MailButton";

export default async function ArchivePage({
  searchParams,
}: {
  searchParams: Promise<{ user?: string; kind?: string; q?: string; year?: string }>;
}) {
  const me = await requireUser();
  const sp = await searchParams;
  const viewAll = can(me, "archive.view_all");

  const people = viewAll
    ? await prisma.user.findMany({
        where: { deletedAt: null, status: "active" },
        select: { id: true, lastName: true, firstName: true, middleName: true, departmentId: true, managerId: true, login: true },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      })
    : [];
  const allowedPeople = people.filter((p) => canViewArchive(me, p));

  let targetId = sp.user || me.id;
  const target = await prisma.user.findFirst({
    where: { id: targetId, deletedAt: null },
    select: {
      id: true,
      login: true,
      lastName: true,
      firstName: true,
      middleName: true,
      email: true,
      departmentId: true,
      managerId: true,
    },
  });
  if (!target || !canViewArchive(me, target)) {
    targetId = me.id;
  }
  const person = target && canViewArchive(me, target) ? target : await prisma.user.findUnique({
    where: { id: me.id },
    select: {
      id: true,
      login: true,
      lastName: true,
      firstName: true,
      middleName: true,
      email: true,
      departmentId: true,
      managerId: true,
    },
  });
  if (!person) return null;

  const kind = sp.kind || "";
  const q = (sp.q || "").trim();
  const year = sp.year || "";

  const rows = await prisma.personDocument.findMany({
    where: {
      userId: person.id,
      ...(kind ? { kind } : {}),
      ...(q
        ? {
            OR: [{ title: { contains: q } }, { kind: { contains: q } }],
          }
        : {}),
    },
    orderBy: { occurredAt: "desc" },
    take: 500,
  });

  const filtered = year
    ? rows.filter((r) => {
        const y = r.occurredAt.toISOString().slice(0, 4);
        const office = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Omsk",
          year: "numeric",
        }).format(r.occurredAt);
        return office === year || y === year;
      })
    : rows;

  const years = Array.from(
    new Set(
      rows.map((r) =>
        new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Omsk", year: "numeric" }).format(r.occurredAt),
      ),
    ),
  ).sort((a, b) => b.localeCompare(a));

  const mine = person.id === me.id;
  const share = shareRoot();

  return (
    <div>
      <PageHeader
        title={mine ? "Мои документы" : `Документы · ${fullName(person)}`}
        subtitle="Ваши личные файлы и копии: приказы, заявления, сканы, чеки. Не путать с рассылками в разделе Документы."
      />

      <form className="mb-5 flex flex-wrap items-end gap-2">
        {viewAll && allowedPeople.length > 0 ? (
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-muted">Сотрудник</span>
            <select name="user" defaultValue={person.id} className="rounded-xl border border-line bg-white px-3 py-2.5">
              {allowedPeople.map((p) => (
                <option key={p.id} value={p.id}>
                  {fullName(p)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted">Вид</span>
          <select name="kind" defaultValue={kind} className="rounded-xl border border-line bg-white px-3 py-2.5">
            <option value="">Все</option>
            {Object.entries(ARCHIVE_KIND_LABEL).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {years.length > 1 ? (
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-muted">Год</span>
            <select name="year" defaultValue={year} className="rounded-xl border border-line bg-white px-3 py-2.5">
              <option value="">Все годы</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="block min-w-[200px] flex-1">
          <span className="mb-1 block text-xs font-semibold text-muted">Поиск</span>
          <input
            name="q"
            defaultValue={q}
            placeholder="Название, номер, магазин…"
            className="w-full rounded-xl border border-line bg-white px-3 py-2.5"
          />
        </label>
        <Button type="submit" variant="secondary">
          Показать
        </Button>
      </form>

      {!person.email ? (
        <p className="mb-4 rounded-xl bg-[var(--wait-bg)] px-4 py-3 text-sm">
          Email не указан — письма с документами не уйдут.{" "}
          {can(me, "users.manage") ? (
            <Link href={`/employees/${person.id}`} className="font-semibold underline">
              Указать в карточке
            </Link>
          ) : (
            "Попросите администратора добавить почту в карточке сотрудника."
          )}
        </p>
      ) : null}

      {filtered.length === 0 ? (
        <Empty
          title="Пока пусто"
          text="Документы появятся здесь, когда вам пришлют файл, вы подпишете, приложите чек или создадите заявление."
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => {
            const abs = r.archivePath ? `${share}/${r.archivePath}`.replace(/\/+/g, "/") : "";
            const unc = abs ? toUnc(abs) : "";
            const hasTime = r.occurredAt.getUTCHours() !== 0 || r.occurredAt.getUTCMinutes() !== 0;
            return (
              <Card key={r.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill tone={ARCHIVE_KIND_TONE[r.kind] || "draft"}>
                        {ARCHIVE_KIND_LABEL[r.kind] || r.kind}
                      </Pill>
                      <span className="text-sm font-semibold text-navy">
                        {hasTime ? fmtDateTime(r.occurredAt) : fmtDate(r.occurredAt)}
                      </span>
                    </div>
                    <div className="mt-1 font-serif text-xl text-navy">{r.title}</div>
                    {unc ? (
                      <div className="mt-1 break-all font-mono text-xs text-muted">{unc}</div>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {r.link ? (
                        <Button href={r.link} variant="secondary" className="px-3 py-1.5 text-sm">
                          Открыть в системе
                        </Button>
                      ) : null}
                      {r.fileId ? (
                        <Button href={`/api/files/${r.fileId}`} variant="secondary" className="px-3 py-1.5 text-sm">
                          Файл
                        </Button>
                      ) : null}
                      <MailButton id={r.id} mailed={Boolean(r.mailedAt)} />
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
