import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Button, Card, PageHeader, Pill } from "@/components/ui";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import { fullName } from "@/lib/names";
import { registryDir } from "@/lib/registry";
import { USER_SAFE_SELECT } from "@/lib/user-public";

export default async function RegistryItemPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const row = await prisma.correspondence.findFirst({
    where: { id, deletedAt: null },
    include: { registeredBy: { select: USER_SAFE_SELECT } },
  });
  if (!row) notFound();
  const d = registryDir(row.direction);
  const file = row.fileId ? await prisma.storedFile.findUnique({ where: { id: row.fileId } }) : null;

  return (
    <div>
      <Link href="/registry" className="mb-2 inline-block text-sm text-muted hover:text-gold">
        ← Журнал
      </Link>
      <PageHeader
        title={row.subject}
        subtitle={`${row.number} · ${fmtDate(row.datedAt)}`}
        actions={<Pill tone={d.tone}>{d.label}</Pill>}
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <dl className="grid gap-3">
            <Item k={row.direction === "out" ? "Кому" : "От кого"} v={row.correspondent} />
            <Item k="Записал" v={`${fullName(row.registeredBy)} · ${fmtDateTime(row.createdAt)}`} />
            {row.comment ? <Item k="Комментарий" v={row.comment} /> : null}
          </dl>
        </Card>
        <Card>
          <h2 className="font-serif text-xl text-navy">Файл</h2>
          {file ? (
            <Button href={`/api/files/${file.id}`} variant="secondary" className="mt-3">
              {file.originalName}
            </Button>
          ) : (
            <p className="mt-3 text-sm text-muted">Скана нет — в журнале только запись.</p>
          )}
        </Card>
      </div>
    </div>
  );
}

function Item({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-xs uppercase text-muted">{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}
