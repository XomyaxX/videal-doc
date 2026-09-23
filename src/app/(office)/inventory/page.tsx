import Link from "next/link";
import { requireUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Button, Card, PageHeader, Pill } from "@/components/ui";
import { InventoryTable } from "./InventoryTable";
import { CLEARANCE_STATUS } from "@/lib/clearance";
import { fullName } from "@/lib/names";
import { fmtDate } from "@/lib/dates";

export default async function InventoryPage() {
  const user = await requireUser();
  const manage = can(user, "inventory.manage");
  const sheets = await prisma.clearanceSheet.findMany({
    where: manage ? {} : { userId: user.id },
    include: { user: { select: { lastName: true, firstName: true, middleName: true } } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return (
    <div>
      <PageHeader
        title="Инвентарь"
        subtitle={manage ? "Что за кем закреплено. АХО правит таблицу и составляет обходные листы." : "Техника и мебель, закреплённые за вами."}
        actions={manage ? <Button href="/inventory/clearance/new">Обходной лист</Button> : null}
      />
      <InventoryTable />
      {sheets.length ? (
        <Card className="mt-6">
          <h2 className="font-serif text-xl text-navy">Обходные листы</h2>
          <ul className="mt-3 divide-y divide-line">
            {sheets.map((s) => {
              const st = CLEARANCE_STATUS[s.status] || CLEARANCE_STATUS.open;
              return (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Link href={`/inventory/clearance/${s.id}`} className="font-semibold text-navy hover:text-gold">
                    {s.number} · {fullName(s.user)}
                  </Link>
                  <span className="flex items-center gap-2 text-sm text-muted">
                    {fmtDate(s.createdAt)}
                    <Pill tone={st.tone}>{st.label}</Pill>
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
