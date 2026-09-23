import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { userCan } from "@/lib/types";
import { prisma } from "@/lib/prisma";
import { nextNumber } from "@/lib/sequence";
import { fullName } from "@/lib/names";
import { audit } from "@/lib/audit";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const manage = userCan(session.user, "inventory.manage");
  const rows = await prisma.clearanceSheet.findMany({
    where: manage ? {} : { userId: session.user.id },
    include: {
      user: { select: { lastName: true, firstName: true, middleName: true, login: true } },
      author: { select: { lastName: true, firstName: true, middleName: true } },
      _count: { select: { lines: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 80,
  });
  return NextResponse.json({
    manage,
    rows: rows.map((r) => ({
      id: r.id,
      number: r.number,
      status: r.status,
      reason: r.reason,
      createdAt: r.createdAt.toISOString(),
      employee: fullName(r.user),
      author: fullName(r.author),
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
  const items = await prisma.inventoryItem.findMany({
    where: { deletedAt: null, userId },
    orderBy: [{ invNo: "asc" }, { name: "asc" }],
  });
  const number = await nextNumber("clearance", "ОБ");
  const sheet = await prisma.clearanceSheet.create({
    data: {
      number,
      userId,
      authorId: session.user.id,
      reason: ["dismissal", "transfer", "other"].includes(String(body.reason)) ? String(body.reason) : "dismissal",
      note: String(body.note || "").trim().slice(0, 2000),
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
    action: "clearance.create",
    entity: "clearance",
    entityId: sheet.id,
    details: fullName(person),
  });
  return NextResponse.json({ id: sheet.id });
}
