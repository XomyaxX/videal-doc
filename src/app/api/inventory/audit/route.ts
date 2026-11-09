import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { userCan } from "@/lib/types";
import { prisma } from "@/lib/prisma";
import { nextNumber } from "@/lib/sequence";
import { fullName } from "@/lib/names";
import { audit } from "@/lib/audit";
import { planAuditStart } from "@/lib/inventory-round-server";

export async function GET() {
  const session = await getSession();
  if (!session || !userCan(session.user, "inventory.manage")) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const rows = await prisma.inventoryAudit.findMany({
    include: {
      user: { select: { lastName: true, firstName: true, middleName: true } },
      _count: { select: { lines: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 40,
  });
  return NextResponse.json({
    rows: rows.map((r) => ({
      id: r.id,
      number: r.number,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      employee: fullName(r.user),
      lines: r._count.lines,
    })),
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !userCan(session.user, "inventory.manage")) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const userId = String(body.userId || "");
  const plan = await planAuditStart(userId);
  if (plan.type === "reject") return NextResponse.json({ error: plan.error }, { status: plan.status });
  if (plan.type === "resume") {
    if (plan.setRoundId) {
      await prisma.inventoryAudit.update({ where: { id: plan.auditId }, data: { roundId: plan.setRoundId } });
    }
    return NextResponse.json({ id: plan.auditId, resumed: true });
  }
  const items = await prisma.inventoryItem.findMany({
    where: { deletedAt: null, userId },
    orderBy: [{ invNo: "asc" }, { name: "asc" }],
  });
  const number = await nextNumber("inv-audit", "ИНВ");
  const row = await prisma.inventoryAudit.create({
    data: {
      number,
      userId,
      authorId: session.user.id,
      roundId: plan.roundId,
      status: "open",
      lines: {
        create: items.map((it, i) => ({
          inventoryItemId: it.id,
          title: it.pcHost ? `${it.name} (${it.pcHost})` : it.name,
          invNo: it.invNo,
          qty: it.qty,
          sortOrder: i,
        })),
      },
    },
  });
  await audit({
    userId: session.user.id,
    action: "inventory.audit.start",
    entity: "inventory-audit",
    entityId: row.id,
    details: plan.personName || "",
  });
  return NextResponse.json({ id: row.id });
}
