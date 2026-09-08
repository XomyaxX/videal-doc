import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { canManageLibrary, canViewLibrary } from "@/lib/library";
import { LibraryForm } from "./LibraryForm";

export default async function NewLibraryPage() {
  const user = await requireUser();
  if (!canViewLibrary(user) || !canManageLibrary(user)) redirect("/forbidden");
  return (
    <div>
      <PageHeader
        title="В хранилище"
        subtitle="Один блок — одна карточка. Внутри сколько угодно файлов. Потом блок целиком прикрепляют к задаче."
      />
      <Card className="max-w-2xl">
        <LibraryForm />
      </Card>
    </div>
  );
}
