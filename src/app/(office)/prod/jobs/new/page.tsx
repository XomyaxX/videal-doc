import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { canLeadProd } from "@/lib/prod";
import { currentEpisodeId } from "@/lib/current-episode";
import { fullName } from "@/lib/names";
import { JobForm } from "../JobForm";

export default async function NewJobPage() {
  const user = await requirePermission("prod.view");
  if (!canLeadProd(user)) redirect("/forbidden");
  const [people, episodes, epId] = await Promise.all([
    prisma.user.findMany({
      where: { deletedAt: null, status: "active" },
      include: { skills: { include: { skill: true } } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.episode.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
    currentEpisodeId(user),
  ]);
  return (
    <div>
      <PageHeader title="Новая крупная задача" subtitle="Сначала команда, потом подзадачи и раздача по скилам." />
      <JobForm
        currentEpisodeId={epId || ""}
        episodes={episodes}
        people={people.map((p) => ({
          id: p.id,
          name: fullName(p),
          skillNames: p.skills.map((s) => s.skill.name),
        }))}
      />
    </div>
  );
}
