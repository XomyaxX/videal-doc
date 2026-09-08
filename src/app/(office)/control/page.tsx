import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Button, Pill } from "@/components/ui";
import { officeYmd, officeClock, fmtTimeOmsk } from "@/lib/dates";
import { fullName } from "@/lib/names";
import { flagLabel } from "@/lib/presence";
import { FlagOk } from "./FlagOk";
import { USER_SAFE_SELECT } from "@/lib/user-public";

function addDays(ymd: string, n: number) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

export default async function ControlPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requirePermission("presence.review");
  const q = await searchParams;
  const to = q.to && /^\d{4}-\d{2}-\d{2}$/.test(q.to) ? q.to : officeYmd();
  const from = q.from && /^\d{4}-\d{2}-\d{2}$/.test(q.from) ? q.from : addDays(to, -6);

  const [flags, days, people] = await Promise.all([
    prisma.attendanceFlag.findMany({
      where: { ymd: { gte: from, lte: to }, resolvedAt: null },
      include: { user: { select: USER_SAFE_SELECT } },
      orderBy: [{ ymd: "desc" }, { createdAt: "desc" }],
    }),
    prisma.attendanceDay.findMany({
      where: { ymd: { gte: from, lte: to } },
      include: { user: { select: USER_SAFE_SELECT } },
    }),
    prisma.user.findMany({
      where: { deletedAt: null, status: "active" },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, lastName: true, firstName: true, middleName: true, login: true },
    }),
  ]);

  const ymds: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) ymds.push(d);
  const byUser = new Map<string, Map<string, (typeof days)[0]>>();
  for (const row of days) {
    if (!byUser.has(row.userId)) byUser.set(row.userId, new Map());
    byUser.get(row.userId)!.set(row.ymd, row);
  }

  return (
    <div>
      <PageHeader
        title="Контроль"
        subtitle="Кто пришёл и ушёл. Опоздания и пропуски. Только руководители."
        actions={
          <div className="flex gap-2">
            <Button href={`/control?from=${addDays(from, -7)}&to=${addDays(to, -7)}`} variant="secondary">
              ← неделя
            </Button>
            <Button href={`/control?from=${addDays(from, 7)}&to=${addDays(to, 7)}`} variant="secondary">
              неделя →
            </Button>
          </div>
        }
      />

      <Card className="mb-6">
        <h2 className="font-serif text-xl text-navy">Отклонения {from} — {to}</h2>
        {flags.length === 0 ? <p className="mt-3 text-sm text-muted">Пока чисто.</p> : null}
        <ul className="mt-3 divide-y divide-line">
          {flags.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div>
                <span className="font-semibold">{fullName(f.user)}</span>
                <span className="ml-2 text-sm text-muted">
                  {f.ymd} · {flagLabel(f.kind)}
                  {f.minutes ? ` · ${f.minutes} мин` : ""}
                  {f.detail ? ` · ${f.detail}` : ""}
                </span>
              </div>
              <FlagOk id={f.id} />
            </li>
          ))}
        </ul>
      </Card>

      <Card className="overflow-x-auto">
        <h2 className="font-serif text-xl text-navy">Табель</h2>
        <table className="mt-3 w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="text-muted">
              <th className="py-1 pr-3 font-medium">Сотрудник</th>
              {ymds.map((d) => (
                <th key={d} className="px-1 py-1 font-medium">
                  {d.slice(8)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.id} className="border-t border-line">
                <td className="py-2 pr-3 font-semibold text-navy">{fullName(p)}</td>
                {ymds.map((d) => {
                  const row = byUser.get(p.id)?.get(d);
                  const rest = !officeClock(new Date(`${d}T12:00:00+06:00`)).weekdayWork;
                  return (
                    <td key={d} className={`px-1 py-2 ${rest ? "bg-paper-2/60 text-muted" : ""}`}>
                      {row?.inAt ? (
                        <span>
                          {fmtTimeOmsk(row.inAt)}
                          {row.outAt ? `–${fmtTimeOmsk(row.outAt)}` : "–"}
                        </span>
                      ) : rest ? (
                        "—"
                      ) : (
                        <Pill tone="wait">нет</Pill>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
