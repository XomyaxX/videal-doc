import { requireUser, can } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { InventoryTable } from "./InventoryTable";

export default async function InventoryPage() {
  const user = await requireUser();
  const manage = can(user, "inventory.manage");
  return (
    <div>
      <PageHeader
        title="Инвентарь"
        subtitle={manage ? "Что за кем закреплено. АХО правит таблицу и скачивает Excel." : "Техника и мебель, закреплённые за вами."}
      />
      <InventoryTable />
    </div>
  );
}
