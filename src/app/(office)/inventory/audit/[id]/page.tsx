import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { fullName } from "@/lib/names";
import { AuditSession } from "./AuditSession";

export default async function AuditPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("inventory.manage");
  const { id } = await params;
  const row = await prisma.inventoryAudit.findUnique({
    where: { id },
    include: {
      user: { select: { lastName: true, firstName: true, middleName: true, department: { select: { name: true } } } },
      lines: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!row) notFound();
  const people = await prisma.user.findMany({
    where: { deletedAt: null, status: "active" },
    select: { id: true, lastName: true, firstName: true, middleName: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  return (
    <div>
      <Link href="/inventory" className="mb-2 inline-block text-sm text-muted hover:text-gold">
        ← Инвентарь
      </Link>
      <PageHeader
        title={`Инвентаризация ${row.number}`}
        subtitle={`${fullName(row.user)}${row.user.department?.name ? ` · ${row.user.department.name}` : ""}`}
      />
      <AuditSession
        closed={row.status !== "open"}
        sheetId={row.id}
        people={people.map((p) => ({ id: p.id, name: fullName(p) }))}
        lines={row.lines.map((l) => ({
          id: l.id,
          title: l.title,
          invNo: l.invNo,
          qty: l.qty,
          action: l.action,
          toUserId: l.toUserId,
          note: l.note,
        }))}
      />
    </div>
  );
}
