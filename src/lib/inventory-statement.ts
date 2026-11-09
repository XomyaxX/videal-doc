/** Сводная ведомость тура и правила переписи. Без Prisma. */

import { employeeBlockReason, type EmployeeGate } from "@/lib/inventory-round";

export const FOUND_ELSEWHERE = "найдено у другого";
export const REWRITTEN_IN = "переписано в обходе";

export function elsewhereNote(fromName: string) {
  return `${FOUND_ELSEWHERE}: от ${fromName}`;
}

export function rewrittenNote(auditNumber: string) {
  return `${REWRITTEN_IN} ${auditNumber}`;
}

export function isFoundElsewhereNote(note: string) {
  return note.trim().startsWith(FOUND_ELSEWHERE);
}

export function isRewrittenNote(note: string) {
  return note.trim().startsWith(REWRITTEN_IN);
}

export function transferFromName(note: string, subjectName: string) {
  if (!isFoundElsewhereNote(note)) return subjectName;
  const tail = note.split(":").slice(1).join(":").trim();
  const from = tail.replace(/^от\s+/i, "").trim();
  return from || "другой сотрудник";
}

export type StatementLineIn = {
  inventoryItemId: string;
  title: string;
  invNo: string;
  qty: number;
  action: string;
  toUserId: string;
  note: string;
};

export type StatementAuditIn = {
  id: string;
  number: string;
  status: string;
  userId: string;
  userName: string;
  department: string;
  lines: StatementLineIn[];
};

export type StatementEmployeeIn = {
  id: string;
  name: string;
  department: string;
};

export type StatementLine = {
  invNo: string;
  title: string;
  bookQty: number;
  factQty: number | null;
  result: string;
  note: string;
  kind: "match" | "missing" | "open" | "transfer" | "echo";
  countInTotals: boolean;
};

export type StatementPerson = {
  userId: string;
  name: string;
  department: string;
  auditNumber: string;
  auditStatus: string;
  lines: StatementLine[];
  match: number;
  missing: number;
  open: number;
  transfer: number;
};

export type StatementUnchecked = {
  name: string;
  department: string;
  state: "pending" | "open";
  auditNumber: string;
};

export type StatementTotals = {
  match: number;
  discrepancy: number;
  transfer: number;
  positions: number;
};

export type InventoryStatement = {
  scope: "round" | "audit";
  interim: boolean;
  org: string;
  inn: string;
  number: string;
  startedAt: string;
  closedAt: string;
  conductor: string;
  people: StatementPerson[];
  unchecked: StatementUnchecked[];
  totals: StatementTotals;
};

export function matchInventoryQuery(item: { invNo: string; name: string; pcHost: string }, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  return [item.invNo, item.name, item.pcHost].some((value) => value.toLowerCase().includes(q));
}

export function planItemReassign(opts: {
  auditStatus: string;
  auditUserId: string;
  recipient: (EmployeeGate & { id: string }) | null;
  item: { id: string; deletedAt: Date | null; userId: string | null; status: string } | null;
  lineHereId: string | null;
  otherOpen: { lineId: string; auditId: string; auditNumber: string }[];
}):
  | { ok: false; status: number; error: string }
  | {
      ok: true;
      foundElsewhere: boolean;
      create: boolean;
      updateLineId: string | null;
      otherOpen: { lineId: string; auditId: string; auditNumber: string }[];
    } {
  if (opts.auditStatus !== "open") return { ok: false, status: 400, error: "Обход уже закрыт" };
  const block = employeeBlockReason(opts.recipient, "recipient");
  if (block || !opts.recipient) return { ok: false, status: 400, error: block || "Выберите сотрудника" };
  if (!opts.item || opts.item.deletedAt) return { ok: false, status: 400, error: "Нет такой позиции" };
  if (opts.item.status === "written_off") return { ok: false, status: 400, error: "Позиция списана" };
  if (opts.item.userId === opts.recipient.id) {
    return { ok: false, status: 400, error: "Вещь уже числится за этим сотрудником" };
  }
  const others = opts.otherOpen.filter((row) => row.lineId !== opts.lineHereId);
  return {
    ok: true,
      foundElsewhere: opts.item.userId !== opts.auditUserId,
    create: !opts.lineHereId,
    updateLineId: opts.lineHereId,
    otherOpen: others,
  };
}

function personTotals(lines: StatementLine[]) {
  const counted = lines.filter((line) => line.countInTotals);
  return {
    match: counted.filter((line) => line.kind === "match").length,
    missing: counted.filter((line) => line.kind === "missing").length,
    open: counted.filter((line) => line.kind === "open").length,
    transfer: counted.filter((line) => line.kind === "transfer").length,
  };
}

function describeLine(line: StatementLineIn, subjectName: string, names: Record<string, string>, countInTotals: boolean): StatementLine {
  const bookQty = line.qty;
  const base = { invNo: line.invNo, title: line.title, bookQty, note: line.note, countInTotals };
  if (!countInTotals && isRewrittenNote(line.note)) {
    return { ...base, factQty: null, kind: "echo", result: "Учтено там, где вещь нашли" };
  }
  if (line.action === "found") {
    return { ...base, factQty: bookQty, kind: "match", result: "Соответствует" };
  }
  if (line.action === "question") {
    const soft = line.note.trim() === "не отмечено при обходе";
    return {
      ...base,
      factQty: 0,
      kind: soft ? "open" : "missing",
      result: soft ? "Под вопросом" : "Не найден",
    };
  }
  if (line.action === "transfer") {
    const to = names[line.toUserId] || "другой сотрудник";
    const from = transferFromName(line.note, subjectName);
    return { ...base, factQty: 0, kind: "transfer", result: `Передано: ${from} → ${to}` };
  }
  return { ...base, factQty: null, kind: "open", result: "Под вопросом" };
}

export function buildInventoryStatement(input: {
  scope: "round" | "audit";
  interim: boolean;
  org: string;
  inn: string;
  number: string;
  startedAt: string;
  closedAt: string;
  conductor: string;
  audits: StatementAuditIn[];
  employees: StatementEmployeeIn[];
  names: Record<string, string>;
}): InventoryStatement {
  const primaryItems = new Set<string>();
  for (const audit of input.audits) {
    for (const line of audit.lines) {
      if (line.inventoryItemId && !isRewrittenNote(line.note)) primaryItems.add(line.inventoryItemId);
    }
  }
  const people: StatementPerson[] = input.audits.map((audit) => {
    const lines = audit.lines.map((line) => {
      const echoed = isRewrittenNote(line.note) && primaryItems.has(line.inventoryItemId);
      return describeLine(line, audit.userName, input.names, !echoed);
    });
    return {
      userId: audit.userId,
      name: audit.userName,
      department: audit.department,
      auditNumber: audit.number,
      auditStatus: audit.status,
      lines,
      ...personTotals(lines),
    };
  });
  const unchecked: StatementUnchecked[] = [];
  if (input.scope === "round") {
    const openByUser = new Map<string, string>();
    const doneUsers = new Set<string>();
    for (const audit of input.audits) {
      if (audit.status === "open") openByUser.set(audit.userId, audit.number);
      if (audit.status === "done") doneUsers.add(audit.userId);
    }
    for (const person of input.employees) {
      const openNumber = openByUser.get(person.id);
      if (openNumber) {
        unchecked.push({ name: person.name, department: person.department, state: "open", auditNumber: openNumber });
        continue;
      }
      if (doneUsers.has(person.id)) continue;
      unchecked.push({ name: person.name, department: person.department, state: "pending", auditNumber: "" });
    }
  }
  const totals = people.reduce<StatementTotals>(
    (acc, person) => {
      acc.match += person.match;
      acc.discrepancy += person.missing + person.open;
      acc.transfer += person.transfer;
      acc.positions += person.match + person.missing + person.open + person.transfer;
      return acc;
    },
    { match: 0, discrepancy: 0, transfer: 0, positions: 0 },
  );
  return {
    scope: input.scope,
    interim: input.interim,
    org: input.org,
    inn: input.inn,
    number: input.number,
    startedAt: input.startedAt,
    closedAt: input.closedAt,
    conductor: input.conductor,
    people,
    unchecked,
    totals,
  };
}
