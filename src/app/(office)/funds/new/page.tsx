import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { fullName } from "@/lib/names";
import { isFundApprover } from "@/lib/leaders";
import { FundForm } from "../FundForm";

export default async function NewFundPage() {
  const user = await requirePermission("finance.create");
  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { managerId: true } });
  const people = await prisma.user.findMany({
    where: { deletedAt: null, status: "active" },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    include: { position: true, role: true, department: true },
  });
  const leaders = people.filter((p) => p.id !== user.id && isFundApprover(p));
  const defaultManagerId = leaders.some((p) => p.id === me?.managerId)
    ? me?.managerId || ""
    : leaders.length === 1
      ? leaders[0].id
      : "";
  return (
    <div>
      <Link href="/finance" className="mb-2 inline-block text-sm text-muted hover:text-gold">
        ← Финансы
      </Link>
      <PageHeader
        title="Новый запрос средств"
        subtitle="Как служебная записка: сумма, на что, кому согласовать. После подписи руководителя бухгалтерия ставит выплату в оборот."
      />
      <FundForm
        managers={leaders.map((p) => ({
          id: p.id,
          name: `${fullName(p)}${p.position?.name ? ` — ${p.position.name}` : ""}`,
        }))}
        defaultManagerId={defaultManagerId}
        payees={people.map((p) => ({
          id: p.id,
          label: fullName(p),
          hint: [p.position?.name, p.department?.name].filter(Boolean).join(" · "),
        }))}
        defaultPayeeId={user.id}
      />
    </div>
  );
}
