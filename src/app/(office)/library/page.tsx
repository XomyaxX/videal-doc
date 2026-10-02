import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Button, PageHeader } from "@/components/ui";
import {
  LIBRARY_KINDS,
  canManageLibrary,
  canViewLibrary,
  filterVisibleLibrary,
  libraryCrumbs,
  libraryItemVisible,
  serializeLibrary,
} from "@/lib/library";
import { type LibraryCard } from "@/components/LibraryPreview";
import { NewFolder } from "./NewFolder";
import { LibraryDesk } from "./LibraryDesk";

function libHref(opts: { folder?: string; q?: string; kind?: string }) {
  const p = new URLSearchParams();
  if (opts.folder) p.set("folder", opts.folder);
  if (opts.q) p.set("q", opts.q);
  if (opts.kind) p.set("kind", opts.kind);
  const s = p.toString();
  return s ? `/library?${s}` : "/library";
}

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; kind?: string; folder?: string }>;
}) {
  const user = await requireUser();
  if (!canViewLibrary(user)) redirect("/forbidden");
  const sp = await searchParams;
  const q = (sp.q || "").trim();
  const kind = sp.kind || "";
  const folder = (sp.folder || "").trim();
  const manage = canManageLibrary(user);
  if (folder) {
    const here = await prisma.libraryItem.findFirst({
      where: { id: folder, deletedAt: null },
      select: { id: true, kind: true },
    });
    if (!here || here.kind !== "folder" || !(await libraryItemVisible(user, folder))) {
      redirect("/library");
    }
  }
  const crumbs = folder ? await libraryCrumbs(folder) : [];

  const rows = await prisma.libraryItem.findMany({
    where: {
      deletedAt: null,
      ...(q
        ? {
            OR: [
              { title: { contains: q } },
              { description: { contains: q } },
              { originalName: { contains: q } },
              { files: { some: { originalName: { contains: q } } } },
            ],
          }
        : { parentId: folder || null }),
      ...(kind
        ? q
          ? { kind }
          : { OR: [{ kind: "folder" }, { kind }] }
        : {}),
    },
    include: {
      author: { select: { lastName: true, firstName: true, middleName: true } },
      files: { orderBy: { sortOrder: "asc" } },
      _count: { select: { acl: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 400,
  });
  const visible = await filterVisibleLibrary(user, rows);
  const items = (visible.map(serializeLibrary) as LibraryCard[]).sort(
    (a, b) => Number(Boolean(b.isFolder)) - Number(Boolean(a.isFolder)),
  );

  return (
    <div>
      <PageHeader
        title="Хранилище"
        subtitle="Папки и файлы шоу. Ссылку можно отдать человеку без учётки — он откроет и скачает."
        actions={
          manage ? (
            <span className="flex flex-wrap gap-2">
              <NewFolder parentId={folder} />
              <Button href={folder ? `/library/new?folder=${folder}` : "/library/new"}>Добавить блок</Button>
            </span>
          ) : null
        }
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
        {kind ? <input type="hidden" name="kind" value={kind} /> : null}
        {folder ? <input type="hidden" name="folder" value={folder} /> : null}
        <Button type="submit" variant="secondary">
          Найти
        </Button>
      </form>

      <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        <Link
          href={libHref({ folder, q })}
          className={`shrink-0 rounded-xl px-3 py-2 text-sm font-semibold ${!kind ? "bg-navy !text-white" : "border border-line bg-white text-navy"}`}
        >
          Все
        </Link>
        {LIBRARY_KINDS.map((k) => (
          <Link
            key={k.id}
            href={libHref({ folder, q, kind: k.id })}
            className={`shrink-0 rounded-xl px-3 py-2 text-sm font-semibold ${
              kind === k.id ? "bg-navy !text-white" : "border border-line bg-white text-navy"
            }`}
          >
            {k.label}
          </Link>
        ))}
      </div>

      <LibraryDesk items={items} folderId={folder} crumbs={crumbs} manage={manage} q={q} kind={kind} />
    </div>
  );
}
