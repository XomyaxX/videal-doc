import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Button, Empty, PageHeader, Pill } from "@/components/ui";
import { LIBRARY_KINDS, LIBRARY_KIND_LABEL, canManageLibrary, canViewLibrary, serializeLibrary } from "@/lib/library";
import { LibraryThumb, type LibraryCard } from "@/components/LibraryPreview";

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; kind?: string }>;
}) {
  const user = await requireUser();
  if (!canViewLibrary(user)) redirect("/forbidden");
  const sp = await searchParams;
  const q = (sp.q || "").trim();
  const kind = sp.kind || "";
  const manage = canManageLibrary(user);

  const rows = await prisma.libraryItem.findMany({
    where: {
      deletedAt: null,
      ...(kind ? { kind } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q } },
              { description: { contains: q } },
              { originalName: { contains: q } },
              { files: { some: { originalName: { contains: q } } } },
            ],
          }
        : {}),
    },
    include: {
      author: { select: { lastName: true, firstName: true, middleName: true } },
      files: { orderBy: { sortOrder: "asc" } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const items = rows.map(serializeLibrary) as LibraryCard[];

  return (
    <div>
      <PageHeader
        title="Хранилище"
        subtitle="Файлы шоу: серии, референсы, материалы. Их потом прикрепляют к задаче."
        actions={manage ? <Button href="/library/new">Добавить блок</Button> : null}
      />

      <form className="mb-5 flex flex-wrap items-end gap-2">
        <label className="block min-w-[220px] flex-1">
          <span className="mb-1 block text-xs font-semibold text-muted">Поиск</span>
          <input
            name="q"
            defaultValue={q}
            placeholder="Название, описание, имя файла"
            className="w-full rounded-xl border border-line bg-white px-3 py-2.5"
          />
        </label>
        <input type="hidden" name="kind" value={kind} />
        <Button type="submit" variant="secondary">
          Найти
        </Button>
      </form>

      <div className="mb-5 flex flex-wrap gap-2">
        <Link
          href={q ? `/library?q=${encodeURIComponent(q)}` : "/library"}
          className={`rounded-xl px-3 py-2 text-sm font-semibold ${!kind ? "bg-navy !text-white" : "border border-line bg-white text-navy"}`}
        >
          Все
        </Link>
        {LIBRARY_KINDS.map((k) => {
          const href = q ? `/library?kind=${k.id}&q=${encodeURIComponent(q)}` : `/library?kind=${k.id}`;
          return (
            <Link
              key={k.id}
              href={href}
              className={`rounded-xl px-3 py-2 text-sm font-semibold ${
                kind === k.id ? "bg-navy !text-white" : "border border-line bg-white text-navy"
              }`}
            >
              {k.label}
            </Link>
          );
        })}
      </div>

      {items.length === 0 ? (
        <Empty
          title="Пока пусто"
          text={manage ? "Добавьте первый файл — логотип, концепт, сценарий или модель." : "Когда руководство положит материалы, они появятся здесь."}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <Link key={item.id} href={item.href}>
              <div className="overflow-hidden rounded-2xl border border-line bg-card shadow-[var(--shadow)] hover:border-gold">
                <LibraryThumb item={item} className="h-40 w-full" />
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-serif text-xl text-navy">{item.title}</div>
                    <Pill tone="draft">{item.kindLabel || LIBRARY_KIND_LABEL[item.kind]}</Pill>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-muted">{item.description}</p>
                  <p className="mt-2 text-xs text-muted">
                    {(item.fileCount ?? 0) > 1 ? `${item.fileCount} файлов` : item.originalName}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
