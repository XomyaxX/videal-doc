import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Button, Empty, PageHeader } from "@/components/ui";
import { fmtDateTime } from "@/lib/dates";
import { fullName } from "@/lib/names";
import { USER_SAFE_SELECT } from "@/lib/user-public";
import {
  parseRemoteLogFilters,
  remoteLogTxtHref,
  remoteLogWhere,
  REMOTE_ACTION_LABEL,
  REMOTE_LOG_LIMIT,
} from "@/lib/remote-log";

function logHref(opts: { user?: string; q?: string; action?: string }) {
  const p = new URLSearchParams();
  if (opts.user) p.set("user", opts.user);
  if (opts.q) p.set("q", opts.q);
  if (opts.action) p.set("action", opts.action);
  const s = p.toString();
  return s ? `/admin/remote-log?${s}` : "/admin/remote-log";
}

export default async function RemoteLogPage({
  searchParams,
}: {
  searchParams: Promise<{ user?: string; q?: string; action?: string }>;
}) {
  await requirePermission("admin.audit");
  const sp = await searchParams;
  const { userId, q, action } = parseRemoteLogFilters(sp);
  const where = remoteLogWhere({ userId, q, action });

  const [people, rows] = await Promise.all([
    prisma.user.findMany({
      where: { deletedAt: null, role: { code: "remote" } },
      select: USER_SAFE_SELECT,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.auditLog.findMany({
      where,
      include: { user: { select: USER_SAFE_SELECT } },
      orderBy: { createdAt: "desc" },
      take: REMOTE_LOG_LIMIT,
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Журнал дистанционных"
        subtitle={`Входы и открытие файлов сотрудников с ролью «Дистанционный». Последние ${REMOTE_LOG_LIMIT} событий.`}
        actions={
          <Button href={remoteLogTxtHref({ user: userId, q, action })} variant="secondary">
            Скачать txt
          </Button>
        }
      />

      <form className="mb-4 flex flex-wrap items-end gap-2" action="/admin/remote-log">
        {userId ? <input type="hidden" name="user" value={userId} /> : null}
        <label className="block min-w-[220px] flex-1">
          <span className="mb-1 block text-xs font-semibold text-muted">Поиск</span>
          <input
            name="q"
            defaultValue={q}
            placeholder="Фамилия, файл, IP, действие"
            className="w-full rounded-xl border border-line bg-white px-3 py-2.5"
          />
        </label>
        <label className="block min-w-[200px]">
          <span className="mb-1 block text-xs font-semibold text-muted">Действие</span>
          <select name="action" defaultValue={action} className="w-full rounded-xl border border-line bg-white px-3 py-2.5">
            <option value="">все</option>
            {Object.entries(REMOTE_ACTION_LABEL).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="secondary">
          Найти
        </Button>
      </form>

      <div className="mb-4 flex flex-wrap gap-2">
        <Link
          href={logHref({ q, action })}
          className={`rounded-xl px-3 py-2 text-sm font-semibold ${!userId ? "bg-navy !text-white" : "border border-line bg-white text-navy"}`}
        >
          Все
        </Link>
        {people.map((p) => (
          <Link
            key={p.id}
            href={logHref({ user: p.id, q, action })}
            className={`rounded-xl px-3 py-2 text-sm font-semibold ${
              userId === p.id ? "bg-navy !text-white" : "border border-line bg-white text-navy"
            }`}
          >
            {fullName(p)}
          </Link>
        ))}
      </div>

      {people.length === 0 ? (
        <Empty title="Пока нет дистанционных" text="Назначьте роль «Дистанционный» в карточке сотрудника." />
      ) : rows.length === 0 ? (
        <Empty title="Записей нет" text={q || action || userId ? "По этому фильтру ничего нет." : "Появятся после входа или открытия файла."} />
      ) : (
        <div className="overflow-auto rounded-2xl border border-line bg-card">
          <table className="w-full text-sm">
            <thead className="bg-paper text-left text-muted">
              <tr>
                <th className="px-3 py-2">Когда</th>
                <th className="px-3 py-2">Кто</th>
                <th className="px-3 py-2">IP</th>
                <th className="px-3 py-2">Действие</th>
                <th className="px-3 py-2">Детали</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="px-3 py-2 whitespace-nowrap">{fmtDateTime(r.createdAt)}</td>
                  <td className="px-3 py-2">{r.user ? fullName(r.user) : "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap font-mono text-xs">{r.ip || "—"}</td>
                  <td className="px-3 py-2">{REMOTE_ACTION_LABEL[r.action] || r.action}</td>
                  <td className="px-3 py-2">{r.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
