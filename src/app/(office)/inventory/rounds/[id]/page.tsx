import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Button, Card, PageHeader, Pill } from "@/components/ui";
import { fullName } from "@/lib/names";
import { loadRoundStatement } from "@/lib/inventory-statement-server";
import { ItemFinder } from "../../ItemFinder";

export default async function InventoryRoundPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("inventory.manage");
  const { id } = await params;
  const [statement, round, people] = await Promise.all([
    loadRoundStatement(id),
    prisma.inventoryRound.findUnique({
      where: { id },
      include: {
        audits: {
          where: { status: "open" },
          include: { user: { select: { lastName: true, firstName: true, middleName: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    prisma.user.findMany({
      where: { deletedAt: null, status: "active" },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, lastName: true, firstName: true, middleName: true },
    }),
  ]);
  if (!statement || !round) notFound();
  return (
    <div>
      <Link href="/inventory/rounds" className="mb-2 inline-block text-sm text-muted hover:text-gold">
        ← Туры
      </Link>
      <PageHeader
        title={statement.number}
        subtitle={`${statement.conductor} · ${statement.startedAt} — ${statement.closedAt}`}
        actions={
          <span className="flex flex-wrap gap-2">
            <Button href={`/api/inventory/rounds/${round.id}/pdf`} variant="secondary">
              PDF
            </Button>
            <Button href={`/api/inventory/rounds/${round.id}/xlsx`} variant="secondary">
              XLSX
            </Button>
          </span>
        }
      />
      {statement.interim ? (
        <p className="mb-4 text-sm font-semibold text-gold">Промежуточная, тур не закрыт. В файл попадут и незавершённые обходы.</p>
      ) : (
        <Pill tone="ok">Тур закрыт</Pill>
      )}
      <Card className="mb-4">
        <p className="text-sm text-navy">
          Соответствует {statement.totals.match}, расхождения {statement.totals.discrepancy}, передано {statement.totals.transfer}.
        </p>
        <ul className="mt-3 divide-y divide-line">
          {statement.people.map((person) => (
            <li key={person.auditNumber} className="py-2 text-sm">
              <span className="font-semibold text-navy">{person.name}</span>
              <span className="text-muted">
                {" "}
                · {person.auditNumber}
                {person.auditStatus === "open" ? " · идёт" : ""} · соответствует {person.match}, расхождения {person.missing + person.open}, передано {person.transfer}
              </span>
            </li>
          ))}
        </ul>
        <h2 className="mt-4 font-semibold text-navy">Не проверены</h2>
        {statement.unchecked.length === 0 ? (
          <p className="mt-1 text-sm text-muted">Все действующие сотрудники закрыты обходом.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm text-muted">
            {statement.unchecked.map((person) => (
              <li key={`${person.name}-${person.state}`}>
                {person.name}
                {person.department ? ` · ${person.department}` : ""} — {person.state === "open" ? "идёт, не завершён" : "не начат"}
                {person.auditNumber ? ` (${person.auditNumber})` : ""}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <ItemFinder
        people={people.map((person) => ({ id: person.id, name: fullName(person) }))}
        audits={round.audits.map((row) => ({ id: row.id, label: `${row.number} · ${fullName(row.user)}` }))}
      />
    </div>
  );
}
