import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { buildRoundRoster } from "@/lib/inventory-round";
import { findOpenRound, loadActivePeople, personLabel } from "@/lib/inventory-round-server";
import { prisma } from "@/lib/prisma";
import { AuditNewForm } from "./AuditNewForm";

export default async function NewAuditPage() {
  await requirePermission("inventory.manage");
  const [people, round] = await Promise.all([loadActivePeople(), findOpenRound()]);
  if (!people.length && !round) redirect("/inventory");
  const named = people.map((p) => ({ id: p.id, name: personLabel(p) }));
  let roundView: {
    number: string;
    checked: number;
    total: number;
    pending: { id: string; name: string }[];
    inProgress: { id: string; name: string; auditId: string }[];
    done: { id: string; name: string; auditId: string }[];
  } | null = null;
  if (round) {
    const audits = await prisma.inventoryAudit.findMany({
      where: { OR: [{ roundId: round.id }, { status: "open" }] },
      select: { id: true, userId: true, status: true, roundId: true },
    });
    const roster = buildRoundRoster(named, audits, round.id);
    roundView = { number: round.number, ...roster };
  }
  return (
    <div>
      <PageHeader
        title="Инвентаризация"
        subtitle={
          roundView
            ? `Тур ${roundView.number}. Проверено ${roundView.checked} из ${roundView.total}.`
            : "Выберите сотрудника. По каждой позиции: на месте, передать другому или не найден — в обработку."
        }
      />
      <AuditNewForm people={named} round={roundView} />
    </div>
  );
}
