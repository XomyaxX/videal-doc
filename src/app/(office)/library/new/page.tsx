import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { canManageLibrary, canViewLibrary } from "@/lib/library";
import { LibraryForm } from "./LibraryForm";

export default async function NewLibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ folder?: string }>;
}) {
  const user = await requireUser();
  if (!canViewLibrary(user) || !canManageLibrary(user)) redirect("/forbidden");
  const folder = (await searchParams).folder || "";
  return (
    <div>
      <PageHeader
        title="В хранилище"
        subtitle="Можно положить любой файл: mp3, pdf, архив, видео. Тип карточки — только ярлык, он ничего не режет."
      />
      <Card className="max-w-2xl">
        <LibraryForm parentId={folder} />
      </Card>
    </div>
  );
}
