import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Button, Card, PageHeader, Pill } from "@/components/ui";
import { LIBRARY_KIND_LABEL, canManageLibrary, canViewLibrary, serializeLibrary } from "@/lib/library";
import { LibraryViewer, type LibraryCard } from "@/components/LibraryPreview";
import { fmtDate } from "@/lib/dates";
import { fullName } from "@/lib/names";
import { STAGE_LABEL } from "@/lib/prod";
import { DeleteLibrary } from "./DeleteLibrary";
import { DeleteLibraryFile } from "./DeleteLibraryFile";
import { USER_SAFE_SELECT } from "@/lib/user-public";

export default async function LibraryItemPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!canViewLibrary(user)) redirect("/forbidden");
  const { id } = await params;
  const row = await prisma.libraryItem.findFirst({
    where: { id, deletedAt: null },
    include: {
      author: { select: USER_SAFE_SELECT },
      files: { orderBy: { sortOrder: "asc" } },
      tasks: {
        include: {
          task: { include: { shot: true, scene: true, asset: true } },
        },
      },
    },
  });
  if (!row) notFound();
  const item = serializeLibrary(row) as LibraryCard;
  const manage = canManageLibrary(user);

  return (
    <div>
      <PageHeader
        title={row.title}
        subtitle={row.description}
        actions={
          <div className="flex gap-2">
            <Button href="/library" variant="secondary">
              К хранилищу
            </Button>
            {manage ? <DeleteLibrary id={row.id} /> : null}
          </div>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
        <Card>
          <LibraryViewer item={item} />
        </Card>
        <div className="space-y-4">
          <Card>
            <Pill tone="draft">{LIBRARY_KIND_LABEL[row.kind] || row.kind}</Pill>
            <dl className="mt-4 space-y-2 text-sm">
              <div>
                <dt className="text-xs uppercase text-muted">Файлы</dt>
                <dd>
                  <ul className="space-y-1">
                    {(item.files && item.files.length > 0
                      ? item.files
                      : [{ id: row.id, originalName: row.originalName, fileUrl: item.fileUrl }]
                    ).map((f) => (
                      <li key={f.id} className="flex items-baseline justify-between gap-3">
                        <a className="min-w-0 break-all font-semibold text-navy underline" href={f.fileUrl}>
                          {f.originalName}
                        </a>
                        {manage ? (
                          <DeleteLibraryFile
                            itemId={row.id}
                            fileId={f.id}
                            name={f.originalName}
                            last={(item.files?.length || 1) <= 1}
                          />
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted">На диске</dt>
                <dd className="break-all font-mono text-xs">{row.uncPath || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted">Кто положил</dt>
                <dd>
                  {fullName(row.author)} · {fmtDate(row.createdAt)}
                </dd>
              </div>
            </dl>
            <p className="mt-4 text-sm text-muted">
              Чтобы сотрудник увидел это в работе, прикрепите файл при постановке задачи — блок «Материалы из
              хранилища».
            </p>
          </Card>
          {row.tasks.length > 0 ? (
            <Card>
              <h2 className="font-serif text-xl text-navy">В задачах</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {row.tasks.map((t) => (
                  <li key={t.taskId}>
                    <Link href={`/prod/tasks/${t.taskId}`} className="font-semibold text-navy hover:text-gold">
                      {STAGE_LABEL[t.task.stage] || t.task.stage}
                      {t.task.shot ? ` · ${t.task.shot.code}` : ""}
                      {t.task.asset ? ` · ${t.task.asset.name}` : ""}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
