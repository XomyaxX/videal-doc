import { NextRequest, NextResponse } from "next/server";
import { DEVICE_COOKIE, getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/login-guard";
import { deviceNameFromUa, devicePlatformFromUa } from "@/lib/origin";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!rateLimit(`2fa-scan:${ip}`, 30, 15 * 60 * 1000)) {
    return NextResponse.json({ error: "Слишком много попыток" }, { status: 429 });
  }
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  if (!session.user.totpOk) {
    return NextResponse.json({ error: "Сначала подтвердите этот телефон кодом" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const id = String(body?.id || body?.challengeId || "");
  if (!id) return NextResponse.json({ error: "Нет кода" }, { status: 400 });

  const row = await prisma.authChallenge.findUnique({ where: { id } });
  if (!row || row.userId !== session.user.id) {
    return NextResponse.json({ error: "Код не найден" }, { status: 404 });
  }
  if (row.consumedAt) return NextResponse.json({ ok: true, status: "ok" });
  if (row.deniedAt) return NextResponse.json({ error: "Отклонено" }, { status: 400 });
  if (row.expiresAt <= new Date()) return NextResponse.json({ error: "Код истёк, обновите квадрат на компьютере" }, { status: 400 });

  if (body?.deny) {
    await prisma.authChallenge.update({ where: { id: row.id }, data: { deniedAt: new Date() } });
    await audit({ userId: session.user.id, action: "2fa.qr.deny", entity: "session", entityId: row.sessionId });
    return NextResponse.json({ ok: true, status: "denied" });
  }

  await prisma.$transaction([
    prisma.authChallenge.update({ where: { id: row.id }, data: { consumedAt: new Date() } }),
    prisma.session.update({ where: { id: row.sessionId }, data: { totpOk: true } }),
  ]);

  const ua = req.headers.get("user-agent") || "";
  const deviceCookie = req.cookies.get(DEVICE_COOKIE)?.value || "";
  if (deviceCookie) {
    const existing = await prisma.userDevice.findFirst({
      where: { userId: session.user.id, revokedAt: null, userAgent: ua.slice(0, 300) },
    });
    if (existing) {
      await prisma.userDevice.update({
        where: { id: existing.id },
        data: { lastSeenAt: new Date(), name: existing.name || deviceNameFromUa(ua) },
      });
    } else {
      await prisma.userDevice.create({
        data: {
          userId: session.user.id,
          name: deviceNameFromUa(ua),
          platform: devicePlatformFromUa(ua),
          userAgent: ua.slice(0, 300),
        },
      });
    }
  }

  await audit({ userId: session.user.id, action: "2fa.qr.ok", entity: "session", entityId: row.sessionId });
  return NextResponse.json({ ok: true, status: "ok" });
}
