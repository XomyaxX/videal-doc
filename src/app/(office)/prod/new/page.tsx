import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, PageHeader } from "@/components/ui";
import { canLeadProd } from "@/lib/prod";
import { fullName } from "@/lib/names";
import { NewTaskForm } from "./NewTaskForm";
import { currentEpisodeId } from "@/lib/current-episode";

export default async function NewTaskPage() {
  const user = await requirePermission("prod.view");
  if (!canLeadProd(user)) redirect("/forbidden");
  const epId = await currentEpisodeId(user);
  const episode = epId
    ? await prisma.episode.findUnique({
        where: { id: epId },
        include: {
          show: { select: { pipelineKind: true } },
          scenes: { orderBy: { sortOrder: "asc" }, include: { shots: { orderBy: { sortOrder: "asc" } } } },
          assets: { orderBy: { sortOrder: "asc" } },
        },
      })
    : null;
  const people = await prisma.user.findMany({
    where: { deletedAt: null, status: "active" },
    include: { skills: { include: { skill: true } } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  return (
    <div>
      <PageHeader
        title="Новая задача"
        subtitle="Шаблон задаёт тип: пайплайн серии, СММ, программирование или свободная карточка. Пачку шотов по-прежнему заводят на пайплайне."
      />
      <Card>
        <NewTaskForm
          pipelineKind={episode?.show.pipelineKind || null}
          episodeId={episode?.id || null}
          scenes={
            episode
              ? episode.scenes.map((s) => ({
                  id: s.id,
                  code: s.code,
                  title: s.title,
                  shots: s.shots.map((sh) => ({ id: sh.id, code: sh.code })),
                }))
              : []
          }
          assets={episode ? episode.assets.map((a) => ({ id: a.id, name: a.name, kind: a.kind })) : []}
          people={people.map((p) => ({
            id: p.id,
            name: fullName(p),
            skillCodes: p.skills.map((s) => s.skill.code),
          }))}
        />
      </Card>
    </div>
  );
}
