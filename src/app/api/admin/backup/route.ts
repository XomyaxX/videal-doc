import { cp, mkdir, readdir, stat, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { userCan } from "@/lib/types";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { fileRoot } from "@/lib/files";

function backupRoot() {
  return path.join(/* turbopackIgnore: true */ process.cwd(), "data", "backups");
}

export async function GET() {
  const session = await getSession();
  if (!session || !userCan(session.user, "admin.backup")) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const root = backupRoot();
  let names: string[] = [];
  try {
    names = await readdir(/* turbopackIgnore: true */ root);
  } catch {
    return NextResponse.json({ rows: [] });
  }
  const rows = [];
  for (const name of names.sort().reverse().slice(0, 30)) {
    try {
      const file = path.join(/* turbopackIgnore: true */ root, name, "videal.db");
      const st = await stat(/* turbopackIgnore: true */ file);
      rows.push({ name, size: st.size, at: st.mtime.toISOString() });
    } catch {
      /* skip broken folder */
    }
  }
  return NextResponse.json({ rows });
}

export async function POST() {
  const session = await getSession();
  if (!session || !userCan(session.user, "admin.backup")) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "").replace(/(\d{8})(\d{4})/, "$1_$2");
  const dir = path.join(/* turbopackIgnore: true */ backupRoot(), stamp);
  await mkdir(/* turbopackIgnore: true */ dir, { recursive: true });
  const dest = path.join(/* turbopackIgnore: true */ dir, "videal.db").replace(/\\/g, "/");
  const safe = dest.replace(/'/g, "''");
  try {
    await prisma.$executeRawUnsafe(`VACUUM INTO '${safe}'`);
    const filesSrc = fileRoot();
    await cp(/* turbopackIgnore: true */ filesSrc, path.join(/* turbopackIgnore: true */ dir, "files"), { recursive: true });
    const envSrc = path.join(/* turbopackIgnore: true */ process.cwd(), ".env");
    try {
      const { readFile } = await import("fs/promises");
      const env = await readFile(envSrc);
      await writeFile(/* turbopackIgnore: true */ path.join(dir, "env.backup"), env, { mode: 0o600 });
    } catch {
      /* .env may be missing locally */
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Не удалось снять копию" },
      { status: 500 },
    );
  }
  await audit({
    userId: session.user.id,
    action: "backup.create",
    entity: "backup",
    entityId: stamp,
  });
  return NextResponse.json({ ok: true, name: stamp });
}
