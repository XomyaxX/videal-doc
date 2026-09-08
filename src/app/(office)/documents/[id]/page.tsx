import { notFound } from "next/navigation";
import { requireUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Button, Card, PageHeader, Pill } from "@/components/ui";
import { fmtDateTime } from "@/lib/dates";
import { fullName } from "@/lib/names";
import { recipientDone } from "@/lib/status";
import { DocActions } from "./DocActions";
import { Viewer } from "./Viewer";
import { USER_SAFE_SELECT } from "@/lib/user-public";
import { VersionForm } from "./VersionForm";
import { ensureDocumentRevisions } from "@/lib/document-revisions";

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const doc = await prisma.document.findFirst({
    where: { id, deletedAt: null },
    include: {
      author: { select: USER_SAFE_SELECT },
      recipients: { include: { user: { select: USER_SAFE_SELECT } } },
    },
  });
  if (!doc) notFound();
  const mine = doc.recipients.find((r) => r.userId === user.id);
  if (!mine && !can(user, "docs.view_all") && doc.authorId !== user.id) notFound();

  await ensureDocumentRevisions(doc);
  const revisions = await prisma.documentRevision.findMany({
    where: { documentId: doc.id },
    include: { author: { select: USER_SAFE_SELECT } },
    orderBy: { version: "desc" },
  });
  const fileIds = [...new Set(revisions.map((r) => r.fileId).concat(doc.originalFileId))];
  const files = await prisma.storedFile.findMany({ where: { id: { in: fileIds } } });
  const fileById = Object.fromEntries(files.map((f) => [f.id, f]));
  const file = fileById[doc.originalFileId];
  const canVersion = doc.authorId === user.id || can(user, "docs.manage");

  return (
    <div data-doc-id={doc.id}>
      <PageHeader
        title={doc.title}
        subtitle={`${doc.number} · версия ${doc.version} · отправил ${fullName(doc.author)} · ${fmtDateTime(doc.createdAt)}`}
        actions={
          <Button href={`/api/files/${doc.originalFileId}`} variant="secondary">
            Скачать для печати
          </Button>
        }
      />
      {doc.comment ? <p className="mb-4 rounded-xl bg-white px-4 py-3 text-muted">{doc.comment}</p> : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="overflow-hidden p-3">
          {file?.mimeType === "application/pdf" || file?.mimeType.startsWith("image/") ? (
            <Viewer fileId={doc.originalFileId} docId={doc.id} />
          ) : (
            <div className="p-8 text-center">
              <p>Этот файл лучше открыть скачиванием.</p>
              <Button href={`/api/files/${doc.originalFileId}`} className="mt-3">
                {file?.originalName}
              </Button>
            </div>
          )}
        </Card>
        <div className="space-y-4">
          {mine ? (
            <Card>
              <h2 className="font-serif text-xl text-navy">Ваши действия</h2>
              <div className="mt-3">
                <DocActions
                  id={doc.id}
                  requireAck={doc.requireAck}
                  requireSignedReturn={doc.requireSignedReturn}
                  requireApproval={doc.requireApproval}
                  isApprover={mine.isApprover}
                  viewed={Boolean(mine.viewedAt)}
                  acked={Boolean(mine.ackedAt)}
                  signed={Boolean(mine.signedAt)}
                  approved={Boolean(mine.approvedAt)}
                  rejected={Boolean(mine.rejectedAt)}
                />
              </div>
            </Card>
          ) : null}
          {canVersion ? (
            <Card>
              <h2 className="font-serif text-xl text-navy">Новая версия</h2>
              <div className="mt-3">
                <VersionForm id={doc.id} />
              </div>
            </Card>
          ) : null}
          {revisions.length > 0 ? (
            <Card>
              <h2 className="font-serif text-xl text-navy">История файла</h2>
              <ul className="mt-3 divide-y divide-line text-sm">
                {revisions.map((r) => {
                  const f = fileById[r.fileId];
                  return (
                    <li key={r.id} className="py-2">
                      <div className="font-medium">
                        Версия {r.version}
                        {r.version === doc.version ? <span className="ml-2 text-xs text-gold">текущая</span> : null}
                      </div>
                      <div className="text-xs text-muted">
                        {fullName(r.author)} · {fmtDateTime(r.createdAt)}
                        {r.note ? ` · ${r.note}` : ""}
                      </div>
                      {f ? (
                        <a className="text-xs text-gold underline" href={`/api/files/${f.id}`}>
                          {f.originalName}
                        </a>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </Card>
          ) : null}
          <Card>
            <h2 className="font-serif text-xl text-navy">Кто как отреагировал</h2>
            <ul className="mt-3 divide-y divide-line text-sm">
              {doc.recipients.map((r) => {
                const st = recipientDone({
                  ackedAt: r.ackedAt,
                  signedAt: r.signedAt,
                  rejectedAt: r.rejectedAt,
                  approvedAt: r.approvedAt,
                  isApprover: r.isApprover,
                  requireAck: doc.requireAck,
                  requireSignedReturn: doc.requireSignedReturn,
                  requireApproval: doc.requireApproval,
                });
                const tone = st === "done" ? "ok" : st === "rejected" ? "bad" : "wait";
                const label = st === "done" ? "готово" : st === "rejected" ? "отказ" : "ждём";
                return (
                  <li key={r.id} className="flex items-start justify-between gap-2 py-2">
                    <div>
                      <div className="font-medium">
                        {fullName(r.user)}
                        {r.isApprover ? <span className="ml-1 text-xs text-gold">согласующий</span> : null}
                      </div>
                      <div className="text-xs text-muted">
                        {r.viewedAt ? `смотрел ${fmtDateTime(r.viewedAt)}` : "ещё не открывал"}
                        {r.ackedAt ? ` · галочка ${fmtDateTime(r.ackedAt)}` : ""}
                        {r.signedAt ? ` · скан ${fmtDateTime(r.signedAt)}` : ""}
                        {r.approvedAt ? ` · согласовано ${fmtDateTime(r.approvedAt)}` : ""}
                        {r.rejectReason ? ` · ${r.rejectReason}` : ""}
                      </div>
                      {r.signedFileId ? (
                        <a className="text-xs text-gold underline" href={`/api/files/${r.signedFileId}`}>
                          подписанный файл
                        </a>
                      ) : null}
                    </div>
                    <Pill tone={tone}>{label}</Pill>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}


