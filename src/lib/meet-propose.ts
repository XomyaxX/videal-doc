import { prisma } from "./prisma";
import { fullName } from "./names";
import { createProdTask } from "./prod-server";
import { parseSummaryJson } from "./meet";
import type { SessionUser } from "./types";
import { canLeadProd } from "./prod";

function norm(s: string) {
  return s.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}

export async function proposeFromSummary(meetingId: string) {
  const meet = await prisma.meeting.findUnique({ where: { id: meetingId } });
  if (!meet || meet.summaryStatus !== "ready") return [];
  const summary = parseSummaryJson(meet.summaryJson);
  const actions = summary?.actions || [];
  const people = await prisma.user.findMany({
    where: { deletedAt: null, status: "active" },
    include: { department: true, position: true, role: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  const staff = people.filter((p) => !["superadmin", "aho"].includes(p.role.code));
  return actions
    .filter((a) => a.task.trim())
    .map((a, i) => {
      const hint = norm(a.owner);
      const hits = hint
        ? staff.filter((p) => {
            const n = norm(`${p.lastName} ${p.firstName} ${p.middleName}`);
            const dept = norm(p.department?.name || "");
            const pos = norm(p.position?.name || "");
            return n.includes(hint) || hint.includes(norm(p.lastName)) || dept.includes(hint) || pos.includes(hint);
          })
        : [];
      const unique = hits.length === 1 ? hits[0] : null;
      return {
        i,
        title: a.task.slice(0, 200),
        brief: (a.brief || a.task).slice(0, 8000),
        ownerHint: a.owner,
        due: a.due,
        assigneeId: unique?.id || "",
        assigneeName: unique ? fullName(unique) : "",
        candidates: hits.slice(0, 6).map((p) => ({ id: p.id, name: fullName(p) })),
      };
    });
}

export async function seedProposedTasks(opts: {
  user: SessionUser;
  meetingId: string;
  items: { title: string; brief: string; assigneeId?: string; due?: string }[];
}) {
  if (!canLeadProd(opts.user)) throw new Error("Задачи создаёт руководитель");
  const meet = await prisma.meeting.findUnique({ where: { id: opts.meetingId } });
  if (!meet || meet.summaryStatus !== "ready") throw new Error("Сводка ещё не готова");
  let seeded: string[] = [];
  try {
    seeded = JSON.parse(meet.summaryTaskIds || "[]");
  } catch {
    seeded = [];
  }
  if (seeded.length) throw new Error("Задачи из этой сводки уже созданы");
  const ids: string[] = [];
  for (const item of opts.items) {
    const title = String(item.title || "").trim().slice(0, 200);
    if (!title) continue;
    let dueAt: Date | null = null;
    if (item.due) {
      const d = new Date(item.due);
      if (!Number.isNaN(d.getTime())) dueAt = d;
    }
    const task = await createProdTask({
      user: opts.user,
      kind: "job",
      stage: "task",
      title,
      brief: item.brief || title,
      assigneeId: item.assigneeId || null,
      dueAt,
    });
    ids.push(task.id);
  }
  await prisma.meeting.update({
    where: { id: meet.id },
    data: { summaryTaskIds: JSON.stringify(ids) },
  });
  return ids;
}
