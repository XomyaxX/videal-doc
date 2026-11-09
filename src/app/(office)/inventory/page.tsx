import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Button, Card, PageHeader, Pill } from "@/components/ui";
import { InventoryTable } from "./InventoryTable";
import { CLEARANCE_STATUS } from "@/lib/clearance";
import { WRITEOFF_STATUS, reasonLabel } from "@/lib/writeoff";
import { fullName } from "@/lib/names";
import { fmtDate } from "@/lib/dates";

export default async function InventoryPage() {
  const user = await requireUser();
  if (user.roleCode === "remote") redirect("/forbidden");
  const manage = can(user, "inventory.manage");
  const [sheets, tmcSheets, audits, writeOffs] = await Promise.all([
    prisma.clearanceSheet.findMany({
    where: manage ? {} : { userId: user.id },
    include: { user: { select: { lastName: true, firstName: true, middleName: true } } },
    orderBy: { createdAt: "desc" },
    take: 20,
    }),
    prisma.tmcSheet.findMany({
      where: manage ? {} : { userId: user.id },
      include: { user: { select: { lastName: true, firstName: true, middleName: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    manage
      ? prisma.inventoryAudit.findMany({
          include: { user: { select: { lastName: true, firstName: true, middleName: true } } },
          orderBy: { createdAt: "desc" },
          take: 15,
        })
      : Promise.resolve([]),
    manage
      ? prisma.writeOffSheet.findMany({
          orderBy: { createdAt: "desc" },
          take: 10,
          include: { _count: { select: { lines: true } } },
        })
      : Promise.resolve([]),
  ]);
  return (
    <div>
      <PageHeader
        title="Инвентарь"
        subtitle={manage ? "Что за кем закреплено. АХО правит таблицу, карточки ТМЦ, обходные листы и акты списания." : "Техника и мебель, закреплённые за вами."}
        actions={
          manage ? (
            <span className="flex flex-wrap gap-2">
              <Button href="/inventory/audit/new">Провести инвентаризацию</Button>
              <Button href="/api/inventory/assignment/pdf" variant="secondary">
                Перечень закрепления
              </Button>
              <Button href="/inventory/tmc/new" variant="secondary">
                Карточка ТМЦ
              </Button>
              <Button href="/inventory/clearance/new" variant="secondary">
                Обходной лист
              </Button>
              <Button href="/inventory/writeoff/new" variant="secondary">
                Акт списания
              </Button>
            </span>
          ) : null
        }
      />
      <InventoryTable />
      {manage ? (
        <Card className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-serif text-xl text-navy">Акты списания</h2>
            <span className="flex flex-wrap gap-2">
              <Button href="/inventory/writeoff" variant="ghost">
                Все акты
              </Button>
              <Button href="/inventory/writeoff/new">Новый акт</Button>
            </span>
          </div>
          {writeOffs.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Пока нет актов. Закрытие списывает позиции целиком.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {writeOffs.map((s) => {
                const st = WRITEOFF_STATUS[s.status] || WRITEOFF_STATUS.open;
                return (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <Link href={`/inventory/writeoff/${s.id}`} className="font-semibold text-navy hover:text-gold">
                      {s.number} · {reasonLabel(s.reason, s.reasonText)} · {s._count.lines} поз.
                    </Link>
                    <span className="flex items-center gap-2 text-sm text-muted">
                      {fmtDate(s.actDate)}
                      <Pill tone={st.tone}>{st.label}</Pill>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      ) : null}
      {audits.length ? (
        <Card className="mt-6">
          <h2 className="font-serif text-xl text-navy">Обходы</h2>
          <ul className="mt-3 divide-y divide-line">
            {audits.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link href={`/inventory/audit/${s.id}`} className="font-semibold text-navy hover:text-gold">
                  {s.number} · {fullName(s.user)}
                </Link>
                <span className="flex items-center gap-2 text-sm text-muted">
                  {fmtDate(s.createdAt)}
                  <Pill tone={s.status === "open" ? "wait" : "ok"}>{s.status === "open" ? "идёт" : "закрыт"}</Pill>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      {tmcSheets.length ? (
        <Card className="mt-6">
          <h2 className="font-serif text-xl text-navy">Карточки ТМЦ</h2>
          <ul className="mt-3 divide-y divide-line">
            {tmcSheets.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link href={`/inventory/tmc/${s.id}`} className="font-semibold text-navy hover:text-gold">
                  {s.number} · {fullName(s.user)}
                </Link>
                <span className="text-sm text-muted">{fmtDate(s.createdAt)}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
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
