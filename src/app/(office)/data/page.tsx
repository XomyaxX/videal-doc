import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { canWorkData, listData, normalizeRel } from "@/lib/share-data";
import { dataViewHref } from "@/lib/share-data-href";
import { DataDesk } from "./DataDesk";

export default async function DataPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const user = await requirePermission("data.view");
  const sp = await searchParams;
  let dir = "";
  try {
    dir = normalizeRel(sp.p || "");
  } catch {
    dir = "";
  }
  let crumbs: { name: string; rel: string }[] = [];
  let entries: Awaited<ReturnType<typeof listData>>["entries"] = [];
  let error = "";
  try {
    const listed = await listData(dir);
    dir = listed.rel;
    crumbs = listed.crumbs;
    entries = listed.entries;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Нет доступа к папке Data";
    if (msg === "Это не папка" && dir) redirect(dataViewHref(dir));
    error = msg;
  }

  return (
    <div>
      <PageHeader
        title="Data"
        subtitle="Сетевая папка Data на диске студии. Дистанционный сотрудник работает только здесь."
      />
      {error ? <p className="mb-4 text-sm text-bad">{error}</p> : null}
      <DataDesk dir={dir} crumbs={crumbs} entries={entries} canWork={canWorkData(user)} />
    </div>
  );
}
