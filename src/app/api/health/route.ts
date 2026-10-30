import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requestTrustedIp } from "@/lib/presence";
import { userCan } from "@/lib/types";
import { nasBackupFreshness } from "@/lib/nas-backup-status";

function isLoopback(req: NextRequest) {
  const ip = requestTrustedIp(req);
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

export async function GET(req: NextRequest) {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    return NextResponse.json({ ok: false, db: false }, { status: 503 });
  }
  const publicBody = { ok: true as const, db: true as const };
  const session = await getSession();
  const staff = Boolean(session && userCan(session.user, "admin.backup"));
  if (!isLoopback(req) && !staff) {
    return NextResponse.json(publicBody);
  }
  const backup = await nasBackupFreshness();
  return NextResponse.json({
    ...publicBody,
    backupOk: backup.backupOk,
    backupAgeHours: backup.ageHours == null ? null : Math.round(backup.ageHours * 10) / 10,
  });
}
