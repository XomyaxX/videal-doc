import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { userCan } from "@/lib/types";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const manage = userCan(session.user, "inventory.manage");
  const rows = await prisma.inventoryItem.findMany({
    where: manage ? { deletedAt: null } : { deletedAt: null, userId: session.user.id },
    include: { user: { select: { id: true, lastName: true, firstName: true, middleName: true, login: true } } },
    orderBy: [{ holderName: "asc" }, { invNo: "asc" }, { name: "asc" }],
  });
  const people = manage
    ? await prisma.user.findMany({
        where: { deletedAt: null, status: "active" },
        select: { id: true, lastName: true, firstName: true, middleName: true, login: true },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      })
    : [];
  return NextResponse.json({ rows, people, manage });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !userCan(session.user, "inventory.manage")) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ error: "Нужно название" }, { status: 400 });
  const row = await prisma.inventoryItem.create({
    data: {
      name,
      invNo: String(body.invNo || "").trim(),
      qty: Number(body.qty) || 1,
      userId: body.userId ? String(body.userId) : null,
      holderName: String(body.holderName || "").trim(),
      kind: body.pcHost ? "pc" : "item",
      pcHost: String(body.pcHost || "").trim(),
      pcCpu: String(body.pcCpu || "").trim(),
      pcGpu: String(body.pcGpu || "").trim(),
      pcRam: String(body.pcRam || "").trim(),
      pcDisk: String(body.pcDisk || "").trim(),
      pcMb: String(body.pcMb || "").trim(),
      note: String(body.note || "").trim(),
    },
  });
  await audit({ userId: session.user.id, action: "inventory.create", entity: "inventory", entityId: row.id });
  return NextResponse.json({ id: row.id });
}
