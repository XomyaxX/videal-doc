import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, PageHeader } from "@/components/ui";
import { canSeeScores } from "@/lib/prod-server";
import { fullName } from "@/lib/names";
import { redirect } from "next/navigation";

export default async function ScoresPage() {
  const user = await requireUser();
  if (!canSeeScores(user)) redirect("/forbidden");
  const events = await prisma.productionScoreEvent.findMany({
    include: { user: { include: { department: true } } },
  });
  const map = new Map<string, { name: string; dept: string; points: number }>();
  for (const e of events) {
    const cur = map.get(e.userId) || {
      name: fullName(e.user),
      dept: e.user.department?.name || "—",
      points: 0,
    };
    cur.points += e.points;
    map.set(e.userId, cur);
  }
  const rows = [...map.values()].sort((a, b) => b.points - a.points);

  return (
    <div>
      <PageHeader
        title="Счётчик производства"
        subtitle="Видно только руководству. Баллы капают при утверждении, не при сдаче. Это не премия."
      />
      <Card>
        {rows.length === 0 ? (
          <p className="text-muted">Пока пусто — баллы появятся после первых утверждений в Доке.</p>
        ) : (
          <table className="w-full text-left text-[15px]">
            <thead>
              <tr className="border-b border-line text-sm text-muted">
                <th className="py-2">Сотрудник</th>
                <th>Отдел</th>
                <th className="text-right">Баллы</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name} className="border-b border-line">
                  <td className="py-2 font-medium">{r.name}</td>
                  <td>{r.dept}</td>
                  <td className="text-right font-serif text-xl text-navy">{r.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
