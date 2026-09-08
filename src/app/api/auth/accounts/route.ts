import { NextRequest, NextResponse } from "next/server";
import { DEVICE_COOKIE } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fullName } from "@/lib/names";
import { rateLimit } from "@/lib/login-guard";

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!rateLimit(`accounts:${ip}`, 60, 15 * 60 * 1000)) {
    return NextResponse.json({ accounts: [] }, { status: 429 });
  }
  const device = req.cookies.get(DEVICE_COOKIE)?.value || "";
  if (!device) return NextResponse.json({ accounts: [] });
  const rows = await prisma.session.findMany({
    where: {
      deviceId: device,
      expiresAt: { gt: new Date() },
      user: { deletedAt: null, status: "active" },
    },
    include: { user: { include: { role: true } } },
    orderBy: { lastSeenAt: "desc" },
  });
  const seen = new Set<string>();
  const accounts = [];
  for (const row of rows) {
    if (seen.has(row.userId)) continue;
    seen.add(row.userId);
    accounts.push({
      userId: row.user.id,
      login: row.user.login,
      fullName: fullName(row.user),
      roleName: row.user.role.name,
    });
  }
  return NextResponse.json({ accounts });
}

export async function POST(req: NextRequest) {
  const device = req.cookies.get(DEVICE_COOKIE)?.value || "";
  const body = await req.json().catch(() => null);
  const userId = String(body?.userId || "");
  if (!device || !userId || body?.action !== "forget") {
    return NextResponse.json({ error: "Нет" }, { status: 400 });
  }
  await prisma.session.deleteMany({ where: { deviceId: device, userId } });
  return NextResponse.json({ ok: true });
}
