import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Button, Card, PageHeader, Pill } from "@/components/ui";
import { HR_STATUS, hrType, letterBody } from "@/lib/hrdocs";
import { fullName } from "@/lib/names";
import { fmtDate } from "@/lib/dates";
import { StatementActions } from "./StatementActions";
import { USER_SAFE_ORG_SELECT } from "@/lib/user-public";

export default async function StatementPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("hrdocs.create");
  const { id } = await params;
  const row = await prisma.hrRequest.findUnique({
    where: { id },
    include: {
      author: { select: USER_SAFE_ORG_SELECT },
      manager: { select: USER_SAFE_ORG_SELECT },
    },
  });
  if (!row) notFound();
  const see = row.authorId === user.id || row.managerId === user.id;
  if (!see) notFound();
  const st = HR_STATUS[row.status] || HR_STATUS.draft;
  const payload = JSON.parse(row.payloadJson || "{}") as Record<string, string>;
  const paragraphs = letterBody(row.type, payload);
  const signed = row.signedFileId
    ? await prisma.storedFile.findUnique({ where: { id: row.signedFileId } })
    : null;

  return (
    <div>
      <Link href="/statements" className="mb-2 inline-block text-sm text-muted hover:text-gold">
        ← Заявления
      </Link>
      <PageHeader
        title={row.title}
        subtitle={`${row.number} · ${hrType(row.type)?.name} · ${fmtDate(row.createdAt)}`}
        actions={<Pill tone={st.tone}>{st.label}</Pill>}
      />
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <p className="text-sm text-muted">
            Кому: {fullName(row.manager)}
            {row.manager.position?.name ? ` · ${row.manager.position.name}` : ""}
          </p>
          <p className="text-sm text-muted">
            От: {fullName(row.author)}
            {row.author.position?.name ? ` · ${row.author.position.name}` : ""}
          </p>
          <div className="mt-4 space-y-3">
            {paragraphs.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
          {row.managerNote ? (
            <p className="mt-4 rounded-xl bg-paper px-3 py-2 text-sm">Комментарий руководителя: {row.managerNote}</p>
          ) : null}
        </Card>
        <div className="space-y-4">
          <Card>
            <h2 className="font-serif text-xl text-navy">Печать</h2>
            <Button href={`/api/hrdocs/${row.id}/pdf`} variant="secondary">
              Открыть PDF
            </Button>
            {signed ? (
              <p className="mt-3 text-sm">
                Скан:{" "}
                <a className="text-gold underline" href={`/api/files/${signed.id}`}>
                  {signed.originalName}
                </a>
              </p>
            ) : (
              <p className="mt-3 text-sm text-muted">Подписанный скан ещё не приложен.</p>
            )}
          </Card>
          <Card>
            <StatementActions
              id={row.id}
              status={row.status}
              signedFileId={row.signedFileId}
              isAuthor={row.authorId === user.id}
              isManager={row.managerId === user.id}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
