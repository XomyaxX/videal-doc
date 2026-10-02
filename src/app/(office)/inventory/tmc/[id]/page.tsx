import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { fullName, shortName } from "@/lib/names";
import { defaultTmcCommission, parseTmcCommission } from "@/lib/tmc";
import { TmcCard } from "./TmcCard";

export default async function TmcPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const manage = can(user, "inventory.manage");
  const row = await prisma.tmcSheet.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          lastName: true,
          firstName: true,
          middleName: true,
          department: { select: { name: true } },
          position: { select: { name: true } },
        },
      },
      lines: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!row) notFound();
  if (!manage && row.userId !== user.id) notFound();
  const commission = parseTmcCommission(row.commissionJson, defaultTmcCommission(shortName(row.user)));
  return (
    <div>
      <Link href="/inventory" className="mb-2 inline-block text-sm text-muted hover:text-gold">
        ← Инвентарь
      </Link>
      <PageHeader title={`Карточка ТМЦ ${row.number}`} subtitle={fullName(row.user)} />
      <TmcCard
        manage={manage}
        sheet={{
          id: row.id,
          number: row.number,
          employee: fullName(row.user),
          position: row.user.position?.name || "",
          workplace: row.user.department?.name || "",
          lines: row.lines.map((l) => ({ title: l.title, invNo: l.invNo, qty: l.qty })),
          commission,
        }}
      />
    </div>
  );
}
