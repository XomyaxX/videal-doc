import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { userCan } from "@/lib/types";
import { prisma } from "@/lib/prisma";
import { nextNumber } from "@/lib/sequence";
import { fullName } from "@/lib/names";
import { audit } from "@/lib/audit";

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
  const person = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { id: true, lastName: true, firstName: true, middleName: true },
  });
  if (!person) return NextResponse.json({ error: "Выберите сотрудника" }, { status: 400 });
  const open = await prisma.inventoryAudit.findFirst({
    where: { userId, status: "open" },
    select: { id: true },
  });
  if (open) return NextResponse.json({ id: open.id, resumed: true });
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
    details: fullName(person),
  });
  return NextResponse.json({ id: row.id });
}
