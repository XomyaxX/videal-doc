import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { fmtDateTime } from "@/lib/dates";
import { fullName } from "@/lib/names";
import { USER_SAFE_SELECT } from "@/lib/user-public";

export default async function AuditPage() {
  await requirePermission("admin.audit");
  const rows = await prisma.auditLog.findMany({
    include: { user: { select: USER_SAFE_SELECT } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return (
    <div>
      <PageHeader title="Журнал действий" subtitle="Последние 200 событий" />
      <div className="overflow-auto rounded-2xl border border-line bg-card">
        <table className="w-full text-sm">
          <thead className="bg-paper text-left text-muted">
            <tr>
              <th className="px-3 py-2">Когда</th>
              <th className="px-3 py-2">Кто</th>
              <th className="px-3 py-2">Действие</th>
              <th className="px-3 py-2">Объект</th>
              <th className="px-3 py-2">Детали</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-line">
                <td className="px-3 py-2 whitespace-nowrap">{fmtDateTime(r.createdAt)}</td>
                <td className="px-3 py-2">{r.user ? fullName(r.user) : "—"}</td>
                <td className="px-3 py-2">{r.action}</td>
                <td className="px-3 py-2">
                  {r.entity} {r.entityId}
                </td>
                <td className="px-3 py-2">{r.details}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
