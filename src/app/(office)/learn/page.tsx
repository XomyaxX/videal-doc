import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { serializeTraining, trainingCrumbs } from "@/lib/training";
import { LearnDesk } from "./LearnDesk";

export default async function LearnPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; folder?: string }>;
}) {
  await requireUser();
  const sp = await searchParams;
  const q = (sp.q || "").trim();
  const folder = (sp.folder || "").trim();
  if (folder) {
    const here = await prisma.trainingItem.findFirst({
      where: { id: folder, deletedAt: null, kind: "folder" },
      select: { id: true },
    });
    if (!here) redirect("/learn");
  }
  const crumbs = folder ? await trainingCrumbs(folder) : [];
  const rows = await prisma.trainingItem.findMany({
    where: {
      deletedAt: null,
      ...(q
        ? {
            OR: [
              { title: { contains: q } },
              { description: { contains: q } },
              { files: { some: { originalName: { contains: q }, deletedAt: null } } },
            ],
          }
        : { parentId: folder || null }),
    },
    include: {
      author: { select: { lastName: true, firstName: true, middleName: true } },
      files: { where: { deletedAt: null }, orderBy: { sortOrder: "asc" } },
    },
    orderBy: [{ kind: "asc" }, { title: "asc" }],
    take: 400,
  });
  const items = rows
    .map((row) => serializeTraining(row))
    .sort((a, b) => Number(b.isFolder) - Number(a.isFolder) || a.title.localeCompare(b.title, "ru"));

  return (
    <div>
      <PageHeader
        title="Обучение"
        subtitle="Материалы студии. Добавляйте и правьте сами. Удаление уходит в корзину — стереть навсегда может администратор."
      />
      <form className="mb-5 flex flex-wrap items-end gap-2">
        <label className="block min-w-[220px] flex-1">
          <span className="mb-1 block text-xs font-semibold text-muted">Поиск</span>
          <input
            name="q"
            defaultValue={q}
            placeholder="Название или имя файла"
            className="w-full rounded-xl border border-line bg-white px-3 py-2.5"
          />
        </label>
        {folder ? <input type="hidden" name="folder" value={folder} /> : null}
        <button type="submit" className="rounded-xl border border-line bg-white px-4 py-2.5 text-[15px] font-semibold text-navy">
          Найти
        </button>
      </form>
      <LearnDesk items={items} folderId={folder} crumbs={crumbs} />
    </div>
  );
}
