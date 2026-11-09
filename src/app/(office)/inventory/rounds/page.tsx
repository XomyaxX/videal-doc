import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Button, Card, PageHeader, Pill } from "@/components/ui";
import { fullName } from "@/lib/names";
import { fmtDate } from "@/lib/dates";

export default async function InventoryRoundsPage() {
  await requirePermission("inventory.manage");
  const rounds = await prisma.inventoryRound.findMany({
    orderBy: { startedAt: "desc" },
    take: 40,
    include: {
      user: { select: { lastName: true, firstName: true, middleName: true } },
      _count: { select: { audits: true } },
    },
  });
  return (
    <div>
      <Link href="/inventory" className="mb-2 inline-block text-sm text-muted hover:text-gold">
        ← Инвентарь
      </Link>
      <PageHeader title="Туры обхода" subtitle="Сводная ведомость по каждому туру: PDF и таблица. У открытого тура файл промежуточный." />
      <Card>
        {rounds.length === 0 ? (
          <p className="text-sm text-muted">Туров ещё не было.</p>
        ) : (
          <ul className="divide-y divide-line">
            {rounds.map((round) => {
              const open = round.status !== "done";
              return (
                <li key={round.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <Link href={`/inventory/rounds/${round.id}`} className="font-semibold text-navy hover:text-gold">
                      {round.number}
                    </Link>
                    <div className="text-sm text-muted">
                      {fmtDate(round.startedAt)}
                      {round.closedAt ? ` — ${fmtDate(round.closedAt)}` : ""} · {fullName(round.user)} · обходов {round._count.audits}
                    </div>
                  </div>
                  <span className="flex flex-wrap items-center gap-2">
                    <Pill tone={open ? "wait" : "ok"}>{open ? "идёт" : "закрыт"}</Pill>
                    <Button href={`/api/inventory/rounds/${round.id}/pdf`} variant="secondary">
                      PDF
                    </Button>
                    <Button href={`/api/inventory/rounds/${round.id}/xlsx`} variant="secondary">
                      XLSX
                    </Button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
