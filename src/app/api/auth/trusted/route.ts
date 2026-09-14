import { NextRequest, NextResponse } from "next/server";
import { DEVICE_COOKIE, getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deviceNameFromUa } from "@/lib/origin";
import { audit } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const mine = req.cookies.get(DEVICE_COOKIE)?.value || "";
  const now = new Date();
  const rows = await prisma.trustedDevice.findMany({
    where: { userId: session.user.id, expiresAt: { gt: now } },
    orderBy: { lastUsedAt: "desc" },
  });
  return NextResponse.json({
    devices: rows.map((r) => ({
      id: r.id,
      name: deviceNameFromUa(r.userAgent),
      lastUsedAt: r.lastUsedAt.toISOString(),
      expiresAt: r.expiresAt.toISOString(),
      current: Boolean(mine) && r.deviceId === mine,
    })),
  });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const id = String(body?.id || "");
  if (!id) return NextResponse.json({ error: "Нет устройства" }, { status: 400 });
  const row = await prisma.trustedDevice.findFirst({ where: { id, userId: session.user.id } });
  if (!row) return NextResponse.json({ error: "Нет устройства" }, { status: 404 });
  await prisma.trustedDevice.delete({ where: { id } });
  await audit({ userId: session.user.id, action: "device.forget", entity: "trustedDevice", entityId: id });
  return NextResponse.json({ ok: true });
}
