import { readFile, stat } from "fs/promises";

const STATUS_FILE = "/var/lib/nas-backup/status.json";
const MARKERS = [
  "/mnt/nas-backup/.last-backup-ok",
  "/mnt/nas-backup/Videal-Ubuntu/.last-backup-ok",
];

export type NasBackupFreshness = {
  found: boolean;
  backupOk: boolean;
  ageHours: number | null;
};

async function lastOkMs() {
  let newest = 0;
  try {
    const raw = await readFile(/* turbopackIgnore: true */ STATUS_FILE, "utf8");
    const data = JSON.parse(raw) as { last_ok?: string; finished?: string };
    const t = Date.parse(String(data.last_ok || data.finished || ""));
    if (Number.isFinite(t) && t > newest) newest = t;
  } catch {
    /* missing or unreadable */
  }
  for (const p of MARKERS) {
    try {
      const st = await stat(/* turbopackIgnore: true */ p);
      if (st.mtimeMs > newest) newest = st.mtimeMs;
    } catch {
      /* unmounted or old dest */
    }
  }
  return newest;
}

export async function nasBackupFreshness(now = Date.now()): Promise<NasBackupFreshness> {
  const newest = await lastOkMs();
  if (!newest) return { found: false, backupOk: false, ageHours: null };
  const ageHours = (now - newest) / 36e5;
  return { found: true, backupOk: ageHours < 36, ageHours };
}
