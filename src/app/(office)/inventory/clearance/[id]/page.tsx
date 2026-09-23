import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { fullName } from "@/lib/names";
import { officeYmd } from "@/lib/dates";
import { defaultClearancePrint, parseClearancePrint } from "@/lib/clearance";
import { ClearanceCard } from "./ClearanceCard";

export default async function ClearancePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const manage = can(user, "inventory.manage");
  const row = await prisma.clearanceSheet.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          lastName: true,
          firstName: true,
          middleName: true,
          department: { select: { name: true } },
          position: { select: { name: true } },
        },
      },
      author: { select: { lastName: true, firstName: true, middleName: true } },
      lines: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!row) notFound();
  if (!manage && row.userId !== user.id) notFound();
  return (
    <div>
      <Link href="/inventory" className="mb-2 inline-block text-sm text-muted hover:text-gold">
        ← Инвентарь
      </Link>
      <PageHeader title={`Обходной лист ${row.number}`} subtitle={fullName(row.user)} />
      <ClearanceCard
        manage={manage}
        initial={{
          id: row.id,
          number: row.number,
          status: row.status,
          reason: row.reason,
          note: row.note,
          createdAt: row.createdAt.toISOString(),
          employee: {
            name: fullName(row.user),
            dept: row.user.department?.name || "",
            position: row.user.position?.name || "",
          },
          author: fullName(row.author),
          lines: row.lines.map((l) => ({
            id: l.id,
            title: l.title,
            invNo: l.invNo,
            qty: l.qty,
            returned: l.returned,
            note: l.note,
          })),
          print: parseClearancePrint(
            row.printJson,
            defaultClearancePrint({
              fullName: fullName(row.user),
              workplace: row.user.department?.name || "",
              position: row.user.position?.name || "",
              dismissedAt: officeYmd(row.createdAt),
              equipment: row.lines,
            }),
          ),
        }}
      />
    </div>
  );
}
