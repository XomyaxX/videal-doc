import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { RegistryForm } from "../RegistryForm";

export default async function RegistryNewPage() {
  await requireUser();
  return (
    <div>
      <PageHeader
        title="Записать письмо"
        subtitle="Номер ВХ или ИСХ выдастся сам. Это журнал, не рассылка сотрудникам."
      />
      <RegistryForm />
    </div>
  );
}
