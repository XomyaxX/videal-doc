import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { fullName } from "@/lib/names";
import { nextNumber } from "@/lib/sequence";
import {
  buildRoundRoster,
  decideAuditStart,
  decideRoundStart,
  nextUnchecked,
  type AuditStartDecision,
  type RoundAuditRef,
  type RoundWalk,
} from "@/lib/inventory-round";

const nameOrder = [{ lastName: "asc" as const }, { firstName: "asc" as const }];

const personSelect = {
  id: true,
  lastName: true,
  firstName: true,
  middleName: true,
  department: { select: { name: true } },
} as const;

export class InventoryRoundError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function personLabel(person: {
  lastName: string;
  firstName: string;
  middleName: string;
  department?: { name: string } | null;
}) {
  const dept = person.department?.name;
  return `${fullName(person)}${dept ? ` · ${dept}` : ""}`;
}

export async function findOpenRound() {
  return prisma.inventoryRound.findFirst({
    where: { status: "open" },
    orderBy: { startedAt: "asc" },
  });
}

export async function loadActivePeople() {
  return prisma.user.findMany({
    where: { deletedAt: null, status: "active" },
    orderBy: nameOrder,
    select: personSelect,
  });
}

async function auditsForRound(roundId: string): Promise<RoundAuditRef[]> {
  return prisma.inventoryAudit.findMany({
    where: { OR: [{ roundId }, { status: "open" }] },
    select: { id: true, userId: true, status: true, roundId: true },
  });
}

/** Снимок открытого тура: прогресс и следующий непроверенный. null, если тура нет. */
export async function loadRoundWalk(afterUserId?: string | null): Promise<(RoundWalk & ReturnType<typeof buildRoundRoster>) | null> {
  const round = await findOpenRound();
  if (!round) return null;
  const [people, audits] = await Promise.all([loadActivePeople(), auditsForRound(round.id)]);
  const named = people.map((p) => ({ id: p.id, name: personLabel(p) }));
  const roster = buildRoundRoster(named, audits, round.id);
  return {
    id: round.id,
    number: round.number,
    ...roster,
    next: nextUnchecked(named, audits, round.id, afterUserId),
  };
}

export async function startInventoryRound(userId: string) {
  const open = await prisma.inventoryRound.findFirst({ where: { status: "open" }, select: { id: true } });
  const decision = decideRoundStart(open);
  if (!decision.ok) throw new InventoryRoundError(decision.error, decision.status);
  const number = await nextNumber("inv-round", "ТУР");
  try {
    const row = await prisma.inventoryRound.create({
      data: { number, userId, status: "open" },
    });
    await audit({
      userId,
      action: "inventory.round.start",
      entity: "inventory-round",
      entityId: row.id,
      details: number,
    });
    return row;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new InventoryRoundError("Уже есть открытый тур", 409);
    }
    throw e;
  }
}

export async function closeInventoryRound(userId: string) {
  const open = await findOpenRound();
  if (!open) throw new InventoryRoundError("Нет открытого тура", 400);
  const walk = await loadRoundWalk(null);
  const row = await prisma.inventoryRound.update({
    where: { id: open.id },
    data: { status: "done", closedAt: new Date() },
  });
  await audit({
    userId,
    action: "inventory.round.close",
    entity: "inventory-round",
    entityId: row.id,
    details: walk ? `${row.number}: проверено ${walk.checked} из ${walk.total}` : row.number,
  });
  return row;
}

export async function planAuditStart(userId: string): Promise<AuditStartDecision & { personName?: string }> {
  const person = await prisma.user.findFirst({
    where: { id: userId },
    select: { id: true, status: true, deletedAt: true, lastName: true, firstName: true, middleName: true },
  });
  const round = await findOpenRound();
  const openAudit = person
    ? await prisma.inventoryAudit.findFirst({
        where: { userId: person.id, status: "open" },
        select: { id: true, roundId: true },
      })
    : null;
  const doneInOpenRound = Boolean(
    person &&
      round &&
      (await prisma.inventoryAudit.findFirst({
        where: { userId: person.id, status: "done", roundId: round.id },
        select: { id: true },
      })),
  );
  const decision = decideAuditStart({
    person: person ? { status: person.status, deletedAt: person.deletedAt } : null,
    openRoundId: round?.id ?? null,
    openAudit,
    doneInOpenRound,
  });
  if (!person || decision.type === "reject") return decision;
  return { ...decision, personName: fullName(person) };
}
