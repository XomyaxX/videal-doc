import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { NewAdvanceForm } from "./NewAdvanceForm";

export default async function NewAdvancePage({
  searchParams,
}: {
  searchParams: Promise<{ funds?: string }>;
}) {
  const user = await requirePermission("finance.create");
  const { funds: pre } = await searchParams;
  const openFunds = await prisma.fundRequest.findMany({
    where: { authorId: user.id, status: "paid", advanceReportId: null, deletedAt: null },
    orderBy: { paidAt: "asc" },
    select: { id: true, number: true, purpose: true, amount: true },
  });
  const preselect = (pre || "").split(",").map((s) => s.trim()).filter(Boolean);
  return (
    <div>
      <Link href="/finance" className="mb-2 inline-block text-sm text-muted hover:text-gold">
        ← Финансы
      </Link>
      <PageHeader
        title="Новый авансовый отчёт"
        subtitle="Выберите запросы одного направления. На следующем шаге приложите чеки: QR или с нуля."
      />
      <NewAdvanceForm funds={openFunds} preselect={preselect} />
    </div>
  );
}
