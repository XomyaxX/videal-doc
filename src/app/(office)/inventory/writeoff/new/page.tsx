import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { officeYmd } from "@/lib/dates";
import { canWriteOff } from "@/lib/writeoff";
import { listWriteOffCandidates } from "@/lib/writeoff-server";
import { WriteOffNewForm } from "./WriteOffNewForm";

export default async function NewWriteOffPage() {
  const user = await requireUser();
  if (user.roleCode === "remote" || !canWriteOff(user)) redirect("/forbidden");
  const items = await listWriteOffCandidates();
  return (
    <div>
      <PageHeader
        title="Новый акт списания"
        subtitle="Дата, причина, комиссия и позиции. Номер СП-YYYY-NNNN присвоится при сохранении."
      />
      <WriteOffNewForm today={officeYmd()} items={items} />
    </div>
  );
}
