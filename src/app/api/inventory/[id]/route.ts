import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { userCan } from "@/lib/types";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !userCan(session.user, "inventory.manage")) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ error: "Нужно название" }, { status: 400 });
  await prisma.inventoryItem.update({
    where: { id },
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
  await audit({ userId: session.user.id, action: "inventory.update", entity: "inventory", entityId: id });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !userCan(session.user, "inventory.manage")) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const { id } = await params;
  await prisma.inventoryItem.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit({ userId: session.user.id, action: "inventory.delete", entity: "inventory", entityId: id });
  return NextResponse.json({ ok: true });
}
