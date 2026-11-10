import { PrismaClient } from "@prisma/client";
import { PERMISSIONS, parsePermissions } from "../src/lib/permissions";
import { placeStaffCards, staffCardBody, staffCardTitle } from "../src/lib/work-board-graph";

const prisma = new PrismaClient();

/**
 * Кладёт на доску карточки всех работающих сотрудников.
 * Существующие строки User, Role, Department и Task не изменяет.
 * Повторный запуск не переписывает уже созданные карточки.
 */
async function main() {
  const people = await prisma.user.findMany({
    where: { deletedAt: null, status: { not: "dismissed" } },
    include: {
      department: { select: { id: true, name: true } },
      position: { select: { name: true } },
      role: { select: { permissions: true } },
      extraDepts: { include: { department: { select: { name: true } } } },
    },
  });
  people.sort((a, b) => {
    const dept = (a.department?.name ?? "яяя").localeCompare(b.department?.name ?? "яяя", "ru");
    if (dept) return dept;
    return `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, "ru");
  });

  const already = new Set(
    (
      await prisma.workBoardTask.findMany({
        where: { staffUserId: { not: null } },
        select: { staffUserId: true },
      })
    ).map((row) => row.staffUserId),
  );

  const fresh = people.filter((person) => !already.has(person.id));
  const groups = new Map<string, typeof fresh>();
  for (const person of fresh) {
    const key = person.departmentId ?? "";
    const list = groups.get(key) ?? [];
    list.push(person);
    groups.set(key, list);
  }
  const ordered = [...groups.values()].sort((a, b) => {
    const left = a[0]?.department?.name ?? "яяя";
    const right = b[0]?.department?.name ?? "яяя";
    return left.localeCompare(right, "ru");
  });
  const slots = placeStaffCards(ordered.map((group) => group.length));
  const maxSort = await prisma.workBoardTask.aggregate({ _max: { sortOrder: true } });
  let sort = maxSort._max.sortOrder ?? 0;
  let created = 0;

  for (const [groupIndex, group] of ordered.entries()) {
    const places = slots[groupIndex] ?? [];
    for (const [index, person] of group.entries()) {
      const codes = parsePermissions(person.role.permissions);
      const accessNames = codes.flatMap((code) => {
        const known = PERMISSIONS.find((item) => item.code === code);
        return known ? [known.name] : [];
      });
      const spot = places[index] ?? { x: 48, y: 88 };
      sort += 10;
      await prisma.workBoardTask.create({
        data: {
          title: staffCardTitle(person.department?.name ?? null, person.firstName, person.lastName),
          body: staffCardBody({
            position: person.position?.name ?? null,
            accessNames,
            extraDepartments: person.extraDepts.map((row) => row.department.name),
          }),
          status: "todo",
          assigneeId: person.id,
          staffUserId: person.id,
          departmentId: person.departmentId,
          posX: spot.x,
          posY: spot.y,
          sortOrder: sort,
        },
      });
      created += 1;
    }
  }

  console.log(`Доска: добавлено карточек сотрудников ${created}, уже были ${already.size}.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
