import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Button, Card, PageHeader, Pill } from "@/components/ui";
import { fmtDate } from "@/lib/dates";
import { fullName } from "@/lib/names";
import { WRITEOFF_STATUS, canWriteOff, reasonLabel } from "@/lib/writeoff";

const FILTERS = [
  { id: "", label: "Все" },
  { id: "open", label: "Черновики" },
  { id: "done", label: "Списанные" },
  { id: "cancelled", label: "Отменённые" },
];

export default async function WriteOffListPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await requireUser();
  if (user.roleCode === "remote" || !canWriteOff(user)) redirect("/forbidden");
  const { status } = await searchParams;
  const current = status && ["open", "done", "cancelled"].includes(status) ? status : "";
  const rows = await prisma.writeOffSheet.findMany({
    where: current ? { status: current } : {},
    include: {
      author: { select: { lastName: true, firstName: true, middleName: true } },
      _count: { select: { lines: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return (
    <div>
      <Link href="/inventory" className="mb-2 inline-block text-sm text-muted hover:text-gold">
        ← Инвентарь
      </Link>
      <PageHeader
        title="Акты списания"
        subtitle="Черновик можно править. Закрытый акт переводит позиции в статус «списано»."
        actions={<Button href="/inventory/writeoff/new">Новый акт</Button>}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Button key={f.id || "all"} href={f.id ? `/inventory/writeoff?status=${f.id}` : "/inventory/writeoff"} variant={current === f.id ? "primary" : "secondary"}>
            {f.label}
          </Button>
        ))}
      </div>
      {rows.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">Актов с таким статусом нет.</p>
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {rows.map((s) => {
              const st = WRITEOFF_STATUS[s.status] || WRITEOFF_STATUS.open;
              return (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Link href={`/inventory/writeoff/${s.id}`} className="font-semibold text-navy hover:text-gold">
                    {s.number} · {reasonLabel(s.reason, s.reasonText)} · {s._count.lines} поз.
                  </Link>
                  <span className="flex items-center gap-2 text-sm text-muted">
                    {fmtDate(s.actDate)} · {fullName(s.author)}
                    <Pill tone={st.tone}>{st.label}</Pill>
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
