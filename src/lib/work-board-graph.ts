export const BOARD_STATUSES = [
  { id: "todo", label: "К выполнению" },
  { id: "wip", label: "В работе" },
  { id: "done", label: "Готово" },
] as const;

export type BoardStatus = (typeof BOARD_STATUSES)[number]["id"];

export const BOARD_EDGE_KINDS = [
  {
    id: "blocks",
    label: "Блокирует",
    edgeLabel: "блокирует",
    hint: "Тяните от задачи, которая мешает, к той, которую она блокирует.",
  },
  {
    id: "depends",
    label: "Зависит от",
    edgeLabel: "нужна для",
    hint: "Тяните от задачи к той, без которой она не начнётся. Стрелка встанет от нужной задачи к зависимой.",
  },
  {
    id: "sequence",
    label: "Дальше",
    edgeLabel: "далее",
    hint: "Тяните от предыдущего шага к следующему. Порядок карточек пересчитается.",
  },
] as const;

export type BoardEdgeKind = (typeof BOARD_EDGE_KINDS)[number]["id"];

export type BoardEdgeRef = { fromId: string; toId: string };

export function isBoardStatus(value: string): value is BoardStatus {
  return BOARD_STATUSES.some((item) => item.id === value);
}

export function isBoardEdgeKind(value: string): value is BoardEdgeKind {
  return BOARD_EDGE_KINDS.some((item) => item.id === value);
}

export function edgeLabel(kind: BoardEdgeKind) {
  return BOARD_EDGE_KINDS.find((item) => item.id === kind)?.edgeLabel ?? "связь";
}

/** Сотрудник, которого можно назначить: не уволен и не удалён. */
export function isAssignableEmployee(user: { status: string; deletedAt: Date | string | null }) {
  return !user.deletedAt && user.status !== "dismissed";
}

/**
 * Пользователь тянет связь от source к target.
 * В базе ребро всегда идёт от более ранней задачи к более поздней.
 * «Зависит от» переворачивает жест: источник зависит от цели.
 */
export function normalizeLink(kind: BoardEdgeKind, sourceId: string, targetId: string): BoardEdgeRef {
  if (kind === "depends") return { fromId: targetId, toId: sourceId };
  return { fromId: sourceId, toId: targetId };
}

export function hasSameLink(edges: BoardEdgeRef[], fromId: string, toId: string) {
  return edges.some((edge) => edge.fromId === fromId && edge.toId === toId);
}

/** true, если новое ребро from → to замкнёт цикл или это петля на себя. */
export function edgeWouldCycle(edges: BoardEdgeRef[], fromId: string, toId: string) {
  if (!fromId || !toId || fromId === toId) return true;
  const next = new Map<string, string[]>();
  for (const edge of edges) {
    const list = next.get(edge.fromId);
    if (list) list.push(edge.toId);
    else next.set(edge.fromId, [edge.toId]);
  }
  const seen = new Set<string>();
  const stack = [toId];
  while (stack.length) {
    const current = stack.pop();
    if (!current || seen.has(current)) continue;
    if (current === fromId) return true;
    seen.add(current);
    const children = next.get(current);
    if (children) stack.push(...children);
  }
  return false;
}

/**
 * Устойчивый топологический порядок.
 * Рёбра любого вида — ограничение «from раньше to».
 * Без рёбер сохраняется прежний sortOrder.
 * null — в графе уже есть цикл.
 */
export function stableTopo(
  tasks: { id: string; sortOrder: number }[],
  edges: BoardEdgeRef[],
): string[] | null {
  const ids = tasks.map((task) => task.id);
  const known = new Set(ids);
  const indegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  const rank = new Map(tasks.map((task) => [task.id, task.sortOrder]));
  for (const id of ids) {
    indegree.set(id, 0);
    outgoing.set(id, []);
  }
  for (const edge of edges) {
    if (!known.has(edge.fromId) || !known.has(edge.toId) || edge.fromId === edge.toId) continue;
    outgoing.get(edge.fromId)?.push(edge.toId);
    indegree.set(edge.toId, (indegree.get(edge.toId) ?? 0) + 1);
  }
  const byRank = (a: string, b: string) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0) || a.localeCompare(b);
  const ready = ids.filter((id) => (indegree.get(id) ?? 0) === 0).sort(byRank);
  const ordered: string[] = [];
  while (ready.length) {
    const id = ready.shift();
    if (!id) break;
    ordered.push(id);
    for (const child of outgoing.get(id) ?? []) {
      const left = (indegree.get(child) ?? 1) - 1;
      indegree.set(child, left);
      if (left === 0) {
        ready.push(child);
        ready.sort(byRank);
      }
    }
  }
  if (ordered.length !== ids.length) return null;
  return ordered;
}

export function assignSortOrders(ids: string[]) {
  const orders = new Map<string, number>();
  ids.forEach((id, index) => orders.set(id, (index + 1) * 10));
  return orders;
}
