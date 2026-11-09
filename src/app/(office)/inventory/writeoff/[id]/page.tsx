import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { canWriteOff } from "@/lib/writeoff";
import { getWriteOffSheet, listWriteOffCandidates } from "@/lib/writeoff-server";
import { WriteOffCard } from "./WriteOffCard";

export default async function WriteOffPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (user.roleCode === "remote" || !canWriteOff(user)) redirect("/forbidden");
  const { id } = await params;
  const sheet = await getWriteOffSheet(id);
  if (!sheet) notFound();
  const candidates = sheet.status === "open" ? await listWriteOffCandidates(sheet.id) : [];
  return (
    <div>
      <Link href="/inventory" className="mb-2 inline-block text-sm text-muted hover:text-gold">
        ← Инвентарь
      </Link>
      <PageHeader title={`Акт списания ${sheet.number}`} subtitle={sheet.actDate} />
      <WriteOffCard initial={sheet} candidates={candidates} />
    </div>
  );
}
