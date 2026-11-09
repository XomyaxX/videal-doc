import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { fullName } from "@/lib/names";
import { fmtDate } from "@/lib/dates";
import { orgNameFull } from "@/lib/org";
import {
  buildInventoryStatement,
  elsewhereNote,
  matchInventoryQuery,
  planItemReassign,
  rewrittenNote,
  type InventoryStatement,
  type StatementAuditIn,
} from "@/lib/inventory-statement";

const nameOrder = [{ lastName: "asc" as const }, { firstName: "asc" as const }];

const personBits = {
  lastName: true,
  firstName: true,
  middleName: true,
  department: { select: { name: true } },
} as const;

export class ReassignError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function deptName(person: { department?: { name: string } | null }) {
  return person.department?.name || "";
}

async function orgHeader() {
  const org = await prisma.organization.findFirst({ select: { name: true, inn: true } });
  return { org: orgNameFull(org), inn: org?.inn?.trim() || "5503283435" };
}

async function namesFor(ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return {} as Record<string, string>;
  const rows = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, lastName: true, firstName: true, middleName: true },
  });
  return Object.fromEntries(rows.map((row) => [row.id, fullName(row)]));
}

function toAuditIn(row: {
  id: string;
  number: string;
  status: string;
  userId: string;
  user: { lastName: string; firstName: string; middleName: string; department: { name: string } | null };
  lines: {
    inventoryItemId: string;
    title: string;
    invNo: string;
    qty: number;
    action: string;
    toUserId: string;
    note: string;
    sortOrder: number;
  }[];
}): StatementAuditIn {
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    userId: row.userId,
    userName: fullName(row.user),
    department: deptName(row.user),
    lines: [...row.lines]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((line) => ({
        inventoryItemId: line.inventoryItemId,
        title: line.title,
        invNo: line.invNo,
        qty: line.qty,
        action: line.action,
        toUserId: line.toUserId,
        note: line.note,
      })),
  };
}

export async function loadRoundStatement(roundId: string): Promise<InventoryStatement | null> {
  const round = await prisma.inventoryRound.findUnique({
    where: { id: roundId },
    include: { user: { select: personBits } },
  });
  if (!round) return null;
  const [audits, employees, header] = await Promise.all([
    prisma.inventoryAudit.findMany({
      where: { roundId },
      include: { user: { select: personBits }, lines: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.user.findMany({
      where: { deletedAt: null, status: "active" },
      orderBy: nameOrder,
      select: { id: true, ...personBits },
    }),
    orgHeader(),
  ]);
  const ids = audits.flatMap((row) => row.lines.map((line) => line.toUserId));
  const names = await namesFor(ids);
  const interim = round.status !== "done";
  return buildInventoryStatement({
    scope: "round",
    interim,
    org: header.org,
    inn: header.inn,
    number: round.number,
    startedAt: fmtDate(round.startedAt),
    closedAt: interim ? "не закрыт" : fmtDate(round.closedAt),
    conductor: fullName(round.user),
    audits: audits.map(toAuditIn),
    employees: employees.map((person) => ({ id: person.id, name: fullName(person), department: deptName(person) })),
    names,
  });
}

export async function loadAuditStatement(auditId: string): Promise<InventoryStatement | null> {
  const row = await prisma.inventoryAudit.findUnique({
    where: { id: auditId },
    include: {
      user: { select: personBits },
      author: { select: { lastName: true, firstName: true, middleName: true } },
      lines: true,
      round: { select: { number: true, status: true } },
    },
  });
  if (!row) return null;
  const header = await orgHeader();
  const names = await namesFor(row.lines.map((line) => line.toUserId));
  const interim = row.status !== "done";
  const statement = buildInventoryStatement({
    scope: "audit",
    interim,
    org: header.org,
    inn: header.inn,
    number: row.number,
    startedAt: fmtDate(row.createdAt),
    closedAt: interim ? "не закрыт" : fmtDate(row.closedAt),
    conductor: fullName(row.author),
    audits: [toAuditIn(row)],
    employees: [],
    names,
  });
  if (row.round) statement.number = `${row.number} · ${row.round.number}`;
  return statement;
}

export async function searchInventoryItems(query: string) {
  const q = query.trim();
  if (q.length < 1) return [];
  const rows = await prisma.inventoryItem.findMany({
    where: { deletedAt: null, status: { not: "written_off" } },
    select: {
      id: true,
      invNo: true,
      name: true,
      pcHost: true,
      qty: true,
      holderName: true,
      userId: true,
      user: { select: { lastName: true, firstName: true, middleName: true } },
    },
    orderBy: [{ invNo: "asc" }, { name: "asc" }],
  });
  return rows
    .filter((row) => matchInventoryQuery(row, q))
    .slice(0, 40)
    .map((row) => ({
      id: row.id,
      invNo: row.invNo,
      name: row.name,
      pcHost: row.pcHost,
      qty: row.qty,
      userId: row.userId,
      holder: row.user ? fullName(row.user) : row.holderName || "не закреплено",
    }));
}

export async function reassignInventoryItem(opts: { auditId: string; inventoryItemId: string; toUserId: string; actorId: string }) {
  const result = await prisma.$transaction(async (tx) => {
    const sheet = await tx.inventoryAudit.findUnique({
      where: { id: opts.auditId },
      include: { lines: true },
    });
    if (!sheet) throw new ReassignError("Нет инвентаризации", 404);
    const recipient = await tx.user.findFirst({
      where: { id: opts.toUserId },
      select: { id: true, status: true, deletedAt: true, lastName: true, firstName: true, middleName: true },
    });
    const item = await tx.inventoryItem.findUnique({
      where: { id: opts.inventoryItemId },
      include: { user: { select: { lastName: true, firstName: true, middleName: true } } },
    });
    const lineHere = sheet.lines.find((line) => line.inventoryItemId === opts.inventoryItemId) || null;
    const others = item
      ? await tx.inventoryAuditLine.findMany({
          where: { inventoryItemId: item.id, audit: { status: "open", id: { not: sheet.id } } },
          select: { id: true, audit: { select: { id: true, number: true } } },
        })
      : [];
    const plan = planItemReassign({
      auditStatus: sheet.status,
      auditUserId: sheet.userId,
      recipient,
      item: item
        ? { id: item.id, deletedAt: item.deletedAt, userId: item.userId, status: item.status }
        : null,
      lineHereId: lineHere?.id || null,
      otherOpen: others.map((row) => ({ lineId: row.id, auditId: row.audit.id, auditNumber: row.audit.number })),
    });
    if (!plan.ok || !item || !recipient) throw new ReassignError(plan.ok ? "Не удалось переписать" : plan.error, plan.ok ? 400 : plan.status);
    const fromName = item.user ? fullName(item.user) : item.holderName.trim() || "не закреплено";
    const title = item.pcHost ? `${item.name} (${item.pcHost})` : item.name;
    const note = plan.foundElsewhere ? elsewhereNote(fromName) : lineHere?.note || "";
    const data = { action: "transfer", toUserId: recipient.id, ...(plan.foundElsewhere ? { note } : {}) };
    const line = plan.updateLineId
      ? await tx.inventoryAuditLine.update({ where: { id: plan.updateLineId }, data })
      : await tx.inventoryAuditLine.create({
          data: {
            auditId: sheet.id,
            inventoryItemId: item.id,
            title,
            invNo: item.invNo,
            qty: item.qty,
            action: "transfer",
            toUserId: recipient.id,
            note,
            sortOrder: sheet.lines.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1,
          },
        });
    for (const other of plan.otherOpen) {
      await tx.inventoryAuditLine.update({
        where: { id: other.lineId },
        data: { action: "transfer", toUserId: recipient.id, note: rewrittenNote(sheet.number) },
      });
    }
    await tx.inventoryItem.update({
      where: { id: item.id },
      data: { userId: recipient.id, status: "ok", holderName: "" },
    });
    return {
      line,
      foundElsewhere: plan.foundElsewhere,
      fromName,
      toName: fullName(recipient),
      otherNumbers: plan.otherOpen.map((row) => row.auditNumber),
      auditNumber: sheet.number,
      invNo: item.invNo,
      title,
    };
  });
  await audit({
    userId: opts.actorId,
    action: "inventory.audit.reassign",
    entity: "inventory-audit",
    entityId: opts.auditId,
    details: `${result.auditNumber}: ${result.invNo} ${result.title}: ${result.fromName} → ${result.toName}${
      result.foundElsewhere ? " (найдено у другого)" : ""
    }${result.otherNumbers.length ? `; снято из ${result.otherNumbers.join(", ")}` : ""}`.slice(0, 2000),
  });
  return {
    foundElsewhere: result.foundElsewhere,
    otherAuditNumbers: result.otherNumbers,
    line: {
      id: result.line.id,
      title: result.line.title,
      invNo: result.line.invNo,
      qty: result.line.qty,
      action: result.line.action,
      toUserId: result.line.toUserId,
      note: result.line.note,
    },
  };
}
