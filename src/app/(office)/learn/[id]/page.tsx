import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Button, Card, PageHeader, Pill } from "@/components/ui";
import { LibraryViewer, type LibraryCard } from "@/components/LibraryPreview";
import { fmtDate } from "@/lib/dates";
import { serializeTraining } from "@/lib/training";
import { LearnItemActions } from "../LearnItemActions";

export default async function LearnItemPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const row = await prisma.trainingItem.findFirst({
    where: { id, deletedAt: null },
    include: {
      author: { select: { lastName: true, firstName: true, middleName: true } },
      files: { where: { deletedAt: null }, orderBy: { sortOrder: "asc" } },
    },
  });
  if (!row) notFound();
  if (row.kind === "folder") redirect(`/learn?folder=${row.id}`);
  const item = serializeTraining(row);
  const viewer: LibraryCard = {
    id: item.id,
    title: item.title,
    kind: item.kind,
    kindLabel: item.kindLabel,
    description: item.description,
    originalName: item.originalName,
    mimeType: item.mimeType,
    uncPath: "",
    preview: item.preview,
    thumbUrl: item.thumbUrl,
    fileUrl: item.fileUrl,
    href: item.href,
    files: item.files.map((f) => ({
      id: f.id,
      originalName: f.originalName,
      mimeType: f.mimeType,
      preview: f.preview,
      fileUrl: f.fileUrl,
      thumbUrl: f.thumbUrl,
    })),
  };
  const mkv = item.files.some((f) => f.originalName.toLowerCase().endsWith(".mkv"));
  const back = row.parentId ? `/learn?folder=${row.parentId}` : "/learn";

  return (
    <div>
      <PageHeader
        title={row.title}
        subtitle={row.description || "Обучающий материал"}
        actions={
          <Button href={back} variant="secondary">
            К списку
          </Button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(18rem,0.7fr)]">
        <Card className="min-w-0 overflow-hidden">
          {item.files.length ? <LibraryViewer item={viewer} /> : <p className="text-muted">Файлов пока нет.</p>}
          {mkv ? (
            <p className="mt-3 text-sm text-muted">
              Файл MKV браузер часто не играет. Если плеер пустой — скачайте ролик и откройте в проигрывателе.
            </p>
          ) : null}
        </Card>
        <div className="min-w-0 space-y-4">
          <Card>
            <Pill tone="draft">{item.kindLabel}</Pill>
            <p className="mt-3 text-sm text-muted">
              {item.authorName} · {fmtDate(row.createdAt)}
            </p>
            <div className="mt-4">
              <LearnItemActions key={`${item.title}:${item.description}:${item.fileCount}`} item={item} />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
