import { requirePermission } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { RequestForm } from "../RequestForm";

export default async function NewRequestPage() {
  await requirePermission("requests.create");
  return (
    <div>
      <PageHeader title="Новый запрос" subtitle="АХО сами посчитают сумму и срок. Можно приложить несколько фото и документов — перетащите в поле." />
      <RequestForm />
    </div>
  );
}
