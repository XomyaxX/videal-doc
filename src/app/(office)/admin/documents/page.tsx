import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, PageHeader } from "@/components/ui";
import { fmtDateTime } from "@/lib/dates";
import { USER_SAFE_SELECT } from "@/lib/user-public";

export default async function AdminDocsPage() {
  await requirePermission("docs.manage");
  const docs = await prisma.document.findMany({
    include: { author: { select: USER_SAFE_SELECT }, recipients: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return (
    <div>
      <PageHeader title="Все документы" subtitle="Админ видит любые рассылки" />
      <div className="space-y-2">
        {docs.map((d) => (
          <Link key={d.id} href={`/documents/${d.id}`}>
            <Card className="hover:border-gold">
              <div className="font-semibold text-navy">
                {d.number} · {d.title}
              </div>
              <div className="text-sm text-muted">
                {fmtDateTime(d.createdAt)} · получателей {d.recipients.length}
                {d.deletedAt ? " · удалён" : ""}
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
