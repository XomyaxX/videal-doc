import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { deviceNameFromUa, devicePlatformFromUa } from "@/lib/origin";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const rows = await prisma.userDevice.findMany({
    where: { userId: session.user.id, revokedAt: null },
    orderBy: { lastSeenAt: "desc" },
    select: { id: true, name: true, platform: true, lastSeenAt: true, enrolledAt: true },
  });
  return NextResponse.json({ devices: rows });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const ua = req.headers.get("user-agent") || "";
  const pushToken = String(body?.pushToken || "").trim();
  const name = String(body?.name || "").trim() || deviceNameFromUa(ua);
  const existing = await prisma.userDevice.findFirst({
    where: { userId: session.user.id, revokedAt: null, userAgent: ua.slice(0, 300) },
  });
  const data = {
    name,
    platform: devicePlatformFromUa(ua),
    userAgent: ua.slice(0, 300),
    pushToken,
    appVersion: String(body?.appVersion || "").slice(0, 40),
    lastSeenAt: new Date(),
  };
  const row = existing
    ? await prisma.userDevice.update({ where: { id: existing.id }, data })
    : await prisma.userDevice.create({ data: { userId: session.user.id, ...data } });
  return NextResponse.json({ id: row.id });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const id = String(body?.id || "");
  if (!id) return NextResponse.json({ error: "Нет устройства" }, { status: 400 });
  const row = await prisma.userDevice.findFirst({ where: { id, userId: session.user.id, revokedAt: null } });
  if (!row) return NextResponse.json({ error: "Нет устройства" }, { status: 404 });
  await prisma.userDevice.update({ where: { id }, data: { revokedAt: new Date(), pushToken: "" } });
  await audit({ userId: session.user.id, action: "device.revoke", entity: "userDevice", entityId: id });
  return NextResponse.json({ ok: true });
}
