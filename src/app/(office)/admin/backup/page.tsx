import { requirePermission } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { BackupPanel } from "./BackupPanel";

export default async function BackupPage() {
  await requirePermission("admin.backup");
  return (
    <div>
      <PageHeader
        title="Резервные копии"
        subtitle="Снимок базы на этот сервер. Файлы на шаре и в data/files копируются отдельно."
      />
      <BackupPanel />
    </div>
  );
}
