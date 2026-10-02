import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { canWorkData, listTrash } from "@/lib/share-data";
import { TrashDesk } from "../TrashDesk";

export default async function DataTrashPage() {
  const user = await requirePermission("data.view");
  if (!canWorkData(user)) redirect("/forbidden");
  const entries = await listTrash();

  return (
    <div>
      <PageHeader
        title="Корзина Data"
        subtitle="Сюда попадают файлы и папки, удалённые с сайта. С диска студии они не стираются, пока вы не восстановите."
      />
      <TrashDesk entries={entries} />
    </div>
  );
}
