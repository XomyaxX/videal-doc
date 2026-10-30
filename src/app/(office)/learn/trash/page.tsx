import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { canPurgeTraining, fmtTrainingSize, serializeTraining } from "@/lib/training";
import { LearnTrashDesk } from "../LearnTrashDesk";

export default async function LearnTrashPage() {
  const user = await requireUser();
  const rows = await prisma.trainingItem.findMany({
    where: { deletedAt: { not: null } },
    include: {
      author: { select: { lastName: true, firstName: true, middleName: true } },
      files: { orderBy: { sortOrder: "asc" } },
    },
    orderBy: { deletedAt: "desc" },
    take: 400,
  });
  const items = rows.map((row) => serializeTraining(row, { trash: true }));
  const looseFiles = await prisma.trainingFile.findMany({
    where: { deletedAt: { not: null }, item: { deletedAt: null } },
    include: {
      item: {
        include: { author: { select: { lastName: true, firstName: true, middleName: true } } },
      },
    },
    orderBy: { deletedAt: "desc" },
    take: 200,
  });

  return (
    <div>
      <PageHeader
        title="Корзина обучения"
        subtitle="Сюда попадают удалённые материалы. Восстановить может любой сотрудник. Стереть с диска — только администратор."
      />
      <LearnTrashDesk
        items={items}
        files={looseFiles.map((f) => ({
          id: f.id,
          itemId: f.itemId,
          originalName: f.originalName,
          sizeLabel: fmtTrainingSize(f.size),
          deletedAt: f.deletedAt ? f.deletedAt.toISOString() : null,
          title: f.item.title,
        }))}
        canPurge={canPurgeTraining(user)}
      />
    </div>
  );
}
