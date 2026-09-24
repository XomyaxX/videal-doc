import { readdir, stat } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    return NextResponse.json({ ok: false, db: false }, { status: 503 });
  }
  const backupMs = await newestBackupMs();
  const ageH = backupMs ? (Date.now() - backupMs) / 36e5 : null;
  const backupOk = ageH != null && ageH < 36;
  return NextResponse.json({
    ok: true,
    db: true,
    backupOk,
    backupAgeHours: ageH == null ? null : Math.round(ageH * 10) / 10,
  });
}
