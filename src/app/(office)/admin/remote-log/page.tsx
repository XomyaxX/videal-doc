import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Empty, PageHeader } from "@/components/ui";
import { fmtDateTime } from "@/lib/dates";
import { fullName } from "@/lib/names";
import { USER_SAFE_SELECT } from "@/lib/user-public";

const ACTION_LABEL: Record<string, string> = {
  login: "Вход",
  "library.file.view": "Открыл файл хранилища",
  "library.file.download": "Скачал файл хранилища",
  "file.view": "Открыл документ",
  "file.download": "Скачал документ",
  "library.share.on": "Включил публичную ссылку",
  "library.share.off": "Выключил публичную ссылку",
  "data.file.view": "Открыл файл Data",
  "data.file.download": "Скачал файл Data",
  "data.file.put": "Записал файл в Data",
  "data.folder": "Создал папку в Data",
  "data.rename": "Переименовал в Data",
  "data.trash": "Перенёс в корзину Data",
  "data.restore": "Восстановил из корзины Data",
  "data.links.view": "Смотрел связи .blend",
  "data.related.zip": "Скачал связанные файлы Data",
  "data.related.restore": "Вернул архив связанных Data",
};

function logHref(userId?: string) {
  return userId ? `/admin/remote-log?user=${encodeURIComponent(userId)}` : "/admin/remote-log";
}

export default async function RemoteLogPage({
  searchParams,
}: {
  searchParams: Promise<{ user?: string }>;
}) {
  await requirePermission("admin.audit");
  const sp = await searchParams;
  const userId = (sp.user || "").trim();

  const [people, rows] = await Promise.all([
    prisma.user.findMany({
      where: { deletedAt: null, role: { code: "remote" } },
      select: USER_SAFE_SELECT,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.auditLog.findMany({
      where: {
        user: { role: { code: "remote" } },
        ...(userId ? { userId } : {}),
      },
      include: { user: { select: USER_SAFE_SELECT } },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Журнал дистанционных"
        subtitle="Входы и открытие файлов сотрудников с ролью «Дистанционный». Последние 500 событий."
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Link
          href={logHref()}
          className={`rounded-xl px-3 py-2 text-sm font-semibold ${!userId ? "bg-navy !text-white" : "border border-line bg-white text-navy"}`}
        >
          Все
        </Link>
        {people.map((p) => (
          <Link
            key={p.id}
            href={logHref(p.id)}
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
        <Empty title="Записей нет" text="Появятся после входа или открытия файла." />
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
                  <td className="px-3 py-2">{ACTION_LABEL[r.action] || r.action}</td>
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
