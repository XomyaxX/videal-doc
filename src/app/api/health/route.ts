import { readdir, stat } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requestTrustedIp } from "@/lib/presence";
import { userCan } from "@/lib/types";

async function newestBackupMs() {
  const roots = [
    path.join(/* turbopackIgnore: true */ process.cwd(), "data", "backups"),
    "/var/log/nas-backup",
  ];
  let newest = 0;
  for (const root of roots) {
    try {
      const names = await readdir(/* turbopackIgnore: true */ root);
      for (const name of names) {
        try {
          const st = await stat(/* turbopackIgnore: true */ path.join(root, name, "videal.db"));
          if (st.mtimeMs > newest) newest = st.mtimeMs;
        } catch {
          try {
            const st = await stat(/* turbopackIgnore: true */ path.join(root, name));
            if (name.includes("last-backup-ok")) {
              if (st.mtimeMs > newest) newest = st.mtimeMs;
            }
          } catch {
            /* skip */
          }
        }
      }
    } catch {
      /* skip */
    }
  }
  try {
    const st = await stat(/* turbopackIgnore: true */ "/mnt/nas-backup/Videal-Ubuntu/.last-backup-ok");
    if (st.mtimeMs > newest) newest = st.mtimeMs;
  } catch {
    /* unmounted */
  }
  return newest;
}

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
  const backupMs = await newestBackupMs();
  const ageH = backupMs ? (Date.now() - backupMs) / 36e5 : null;
  const backupOk = ageH != null && ageH < 36;
  return NextResponse.json({
    ...publicBody,
    backupOk,
    backupAgeHours: ageH == null ? null : Math.round(ageH * 10) / 10,
  });
}
