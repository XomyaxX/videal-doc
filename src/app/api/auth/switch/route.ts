import { NextRequest, NextResponse } from "next/server";
import { DEVICE_COOKIE, SESSION_COOKIE } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sessionCookieOpts } from "@/lib/cookie";
import { fullName } from "@/lib/names";
import { rateLimit } from "@/lib/login-guard";
import { needs2fa } from "@/lib/privileges";
import { parsePermissions } from "@/lib/permissions";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!rateLimit(`switch:${ip}`, 40, 15 * 60 * 1000)) {
    return NextResponse.json({ error: "Слишком часто" }, { status: 429 });
  }
  const body = await req.json().catch(() => null);
  const userId = String(body?.userId || "");
  const device = req.cookies.get(DEVICE_COOKIE)?.value || "";
  if (!device || !userId) return NextResponse.json({ error: "Сессия истекла" }, { status: 401 });
  const row = await prisma.session.findFirst({
    where: {
      userId,
      deviceId: device,
      expiresAt: { gt: new Date() },
      user: { deletedAt: null, status: "active" },
    },
    include: { user: { include: { role: true } } },
    orderBy: { lastSeenAt: "desc" },
  });
  if (!row) return NextResponse.json({ error: "Сессия истекла" }, { status: 401 });
  const perms = parsePermissions(row.user.role.permissions);
  const privileged = needs2fa({ roleCode: row.user.role.code, permissions: perms });
  if (privileged) {
    await prisma.session.update({ where: { id: row.id }, data: { totpOk: false } });
  }
  const res = NextResponse.json({
    account: {
      userId: row.user.id,
      login: row.user.login,
      fullName: fullName(row.user),
      roleName: row.user.role.name,
    },
    mustChangePassword: row.user.mustChangePassword,
    need2faSetup: privileged && !row.user.totpEnabled,
    need2fa: privileged && row.user.totpEnabled,
  });
  res.cookies.set(SESSION_COOKIE, row.token, sessionCookieOpts(req));
  return res;
}
