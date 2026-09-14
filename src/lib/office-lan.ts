import { execFile } from "child_process";
import { promisify } from "util";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "./prisma";
import { officeClock } from "./dates";
import { officeCidrs, onApprovedLeave, markIn } from "./presence";

const execFileAsync = promisify(execFile);
export const LAN_SEEN_MS = 12 * 60 * 1000;

export function normalizeMac(raw: string) {
  const hex = (raw || "").toLowerCase().replace(/[^0-9a-f]/g, "");
  if (hex.length !== 12) return "";
  if (hex === "000000000000" || hex === "ffffffffffff") return "";
  if (hex.startsWith("01005e")) return "";
  return hex.match(/.{2}/g)!.join(":");
}

function ipv4ToInt(ip: string) {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((n) => n > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function intToIpv4(n: number) {
  return `${(n >>> 24) & 255}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`;
}

export function hostsFromCidr(cidr: string) {
  const [net, bitsRaw] = cidr.split("/");
  const bits = bitsRaw === undefined ? 32 : Number(bitsRaw);
  const netN = ipv4ToInt(net);
  if (netN == null || bits < 24 || bits > 32) return [];
  if (bits === 32) return [net];
  const hostBits = 32 - bits;
  const size = 1 << hostBits;
  const base = (netN >>> hostBits) << hostBits;
  const out: string[] = [];
  for (let i = 1; i < size - 1; i++) out.push(intToIpv4((base + i) >>> 0));
  return out;
}

async function mapPool<T>(items: T[], n: number, fn: (item: T) => Promise<void>) {
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const cur = items[i++];
      await fn(cur);
    }
  }
  const k = Math.min(n, Math.max(1, items.length));
  await Promise.all(Array.from({ length: k }, () => worker()));
}

async function pingSweep(hosts: string[]) {
  await mapPool(hosts, 40, async (ip) => {
    await execFileAsync("ping", ["-c", "1", "-W", "1", ip], { timeout: 2500 }).catch(() => {});
  });
}

export type LanHost = { ip: string; mac: string };

export async function readNeigh(): Promise<LanHost[]> {
  const { stdout } = await execFileAsync("ip", ["-4", "neigh", "show"], { timeout: 8000 }).catch(() => ({ stdout: "" }));
  const out: LanHost[] = [];
  const seen = new Set<string>();
  for (const line of stdout.split("\n")) {
    const m = line.match(/^(\d{1,3}(?:\.\d{1,3}){3})\s+dev\s+\S+\s+lladdr\s+([0-9a-fA-F:.-]+)\s+(\S+)/);
    if (!m) continue;
    const state = m[3].toUpperCase();
    if (state === "FAILED" || state === "INCOMPLETE" || state === "NONE") continue;
    const mac = normalizeMac(m[2]);
    const ip = m[1];
    if (!mac || !ipv4ToInt(ip)) continue;
    const key = `${mac}|${ip}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ip, mac });
  }
  return out;
}

export async function scanOfficeLan(): Promise<LanHost[]> {
  const cidrs = await officeCidrs();
  const hosts = [...new Set(cidrs.flatMap(hostsFromCidr))].slice(0, 512);
  if (hosts.length) await pingSweep(hosts);
  return readNeigh();
}

export function lanIps(ip: string, extra: string[] = []) {
  const all = [ip, ...extra];
  const out: string[] = [];
  for (const raw of all) {
    const n = ipv4ToInt(raw);
    if (n == null) continue;
    const a = (n >>> 24) & 255;
    const b = (n >>> 16) & 255;
    const priv =
      (a === 192 && b === 168) || (a === 10 && b !== 8) || (a === 172 && b >= 16 && b <= 31);
    if (!priv) continue;
    if (!out.includes(raw)) out.push(raw);
  }
  return out;
}

export async function macForIps(ips: string[]): Promise<LanHost | null> {
  const uniq = lanIps("", ips);
  if (!uniq.length) return null;
  await mapPool(uniq, 8, async (ip) => {
    await execFileAsync("ping", ["-c", "1", "-W", "1", ip], { timeout: 2500 }).catch(() => {});
  });
  const neigh = await readNeigh();
  for (const ip of uniq) {
    const hit = neigh.find((h) => h.ip === ip);
    if (hit) return hit;
  }
  return null;
}

export async function pinMacToUser(opts: { userId: string; ips: string[]; takeOver?: boolean }) {
  const ips = lanIps("", opts.ips);
  if (!ips.length) return { ok: false as const, error: "Нет локального IP — откройте Док с офисного Wi‑Fi" };
  const mine = await prisma.officeStation.findFirst({
    where: { userId: opts.userId, ipv4: { in: ips } },
  });
  if (mine) {
    await prisma.officeStation.update({ where: { id: mine.id }, data: { lastSeenAt: new Date() } });
    return { ok: true as const, mac: mine.mac, ip: mine.ipv4, already: true };
  }
  const hit = await macForIps(ips);
  if (!hit) return { ok: false as const, error: "Сервер не видит этот ПК в сети. Подождите минуту и нажмите ещё раз." };
  const existing = await prisma.officeStation.findUnique({ where: { mac: hit.mac } });
  if (existing && existing.userId !== opts.userId && !opts.takeOver) {
    return { ok: true as const, mac: hit.mac, ip: hit.ip, skipped: true };
  }
  await prisma.officeStation.upsert({
    where: { mac: hit.mac },
    create: { userId: opts.userId, mac: hit.mac, ipv4: hit.ip, label: "ПК", lastSeenAt: new Date() },
    update: { userId: opts.userId, ipv4: hit.ip, lastSeenAt: new Date() },
  });
  return { ok: true as const, mac: hit.mac, ip: hit.ip };
}

export async function rememberLanSightings(hosts: LanHost[]) {
  const now = new Date();
  const macs = [...new Set(hosts.map((h) => h.mac))];
  if (!macs.length) return [];
  const stations = await prisma.officeStation.findMany({
    where: { mac: { in: macs } },
    include: { user: { select: { id: true, lastName: true, firstName: true, middleName: true, status: true, deletedAt: true } } },
  });
  const byMac = new Map(hosts.map((h) => [h.mac, h]));
  for (const st of stations) {
    const hit = byMac.get(st.mac);
    if (!hit) continue;
    await prisma.officeStation.update({
      where: { id: st.id },
      data: { lastSeenAt: now, ipv4: hit.ip },
    });
  }
  return stations;
}

export async function applyLanPresence() {
  const clock = officeClock();
  const hosts = await scanOfficeLan();
  const stations = await rememberLanSightings(hosts);
  if (!clock.weekdayWork) return { hosts: hosts.length, autoIn: 0 };
  const ipByMac = new Map(hosts.map((h) => [h.mac, h.ip]));
  let autoIn = 0;
  const seenUsers = new Set<string>();
  for (const st of stations) {
    if (st.user.deletedAt || st.user.status !== "active") continue;
    if (seenUsers.has(st.userId)) continue;
    seenUsers.add(st.userId);
    if (await onApprovedLeave(st.userId, clock.ymd)) continue;
    const res = await markIn({ userId: st.userId, ip: ipByMac.get(st.mac) || st.ipv4 || "lan", source: "lan" });
    if (res.ok && !res.already) autoIn += 1;
  }
  return { hosts: hosts.length, autoIn };
}

export function lanBindToken(userId: string) {
  const secret = process.env.SESSION_SECRET || "videal-lan";
  return createHmac("sha256", secret).update(`lan:${userId}`).digest("hex").slice(0, 20);
}

export function lanBindTokenOk(userId: string, k: string) {
  if (!userId || !k) return false;
  const a = Buffer.from(lanBindToken(userId));
  const b = Buffer.from(String(k));
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function bindAllLoggedIn() {
  const hosts = await scanOfficeLan();
  await rememberLanSightings(hosts);
  const ipMac = new Map(hosts.map((h) => [h.ip, h.mac]));
  const since = new Date(Date.now() - 15 * 60 * 1000);
  const [screens, sessions] = await Promise.all([
    prisma.officeIdentify.findMany({
      where: { userId: { not: "" }, seenAt: { gte: since } },
    }),
    prisma.session.findMany({
      where: { lastSeenAt: { gte: since }, lastLanIp: { startsWith: "192.168." }, expiresAt: { gt: new Date() } },
      select: { userId: true, lastLanIp: true },
    }),
  ]);
  const jobs: { userId: string; ip: string }[] = [];
  for (const s of screens) {
    if (s.userId && s.ip.startsWith("192.168.")) jobs.push({ userId: s.userId, ip: s.ip });
  }
  for (const s of sessions) {
    if (s.userId && s.lastLanIp.startsWith("192.168.")) jobs.push({ userId: s.userId, ip: s.lastLanIp });
  }
  const usedMac = new Set<string>();
  const usedUser = new Set<string>();
  let bound = 0;
  let skipped = 0;
  for (const job of jobs) {
    if (usedUser.has(job.userId)) {
      skipped += 1;
      continue;
    }
    let mac = ipMac.get(job.ip) || "";
    if (!mac) {
      const hit = await macForIps([job.ip]);
      mac = hit?.mac || "";
      if (hit) ipMac.set(hit.ip, hit.mac);
    }
    if (!mac || usedMac.has(mac)) {
      skipped += 1;
      continue;
    }
    await prisma.officeStation.upsert({
      where: { mac },
      create: { userId: job.userId, mac, ipv4: job.ip, label: "ПК", lastSeenAt: new Date() },
      update: { userId: job.userId, ipv4: job.ip, lastSeenAt: new Date() },
    });
    usedMac.add(mac);
    usedUser.add(job.userId);
    bound += 1;
  }
  const stations = await prisma.officeStation.findMany({
    include: { user: { select: { lastName: true, firstName: true, middleName: true } } },
    orderBy: { lastSeenAt: "desc" },
  });
  return { bound, skipped, hosts: hosts.length, stations };
}

export function stationOnline(lastSeenAt: Date | null | undefined, now = Date.now()) {
  if (!lastSeenAt) return false;
  return now - lastSeenAt.getTime() < LAN_SEEN_MS;
}

export const IDENTIFY_MS = 45 * 60 * 1000;

export async function identifyUntil(): Promise<Date | null> {
  const s = await prisma.appSettings.findUnique({ where: { id: "default" }, select: { identifyUntil: true } });
  if (!s?.identifyUntil || s.identifyUntil.getTime() <= Date.now()) return null;
  return s.identifyUntil;
}

export async function startIdentify() {
  const until = new Date(Date.now() + IDENTIFY_MS);
  await prisma.appSettings.upsert({
    where: { id: "default" },
    create: { id: "default", identifyUntil: until },
    update: { identifyUntil: until },
  });
  await prisma.officeIdentify.deleteMany({});
  return until;
}

export async function stopIdentify() {
  await prisma.appSettings.updateMany({ where: { id: "default" }, data: { identifyUntil: null } });
  await prisma.officeIdentify.deleteMany({});
}

function nextCode(used: Set<string>) {
  for (let i = 0; i < 80; i++) {
    const n = String(10 + Math.floor(Math.random() * 90));
    if (!used.has(n)) return n;
  }
  return String(10 + Math.floor(Math.random() * 90));
}

export async function registerIdentify(opts: { deviceId: string; userId?: string; ip: string }) {
  const until = await identifyUntil();
  if (!until) return null;
  const deviceId = (opts.deviceId || "").slice(0, 80);
  if (deviceId.length < 8) return { until, code: "" };
  const existing = await prisma.officeIdentify.findUnique({ where: { deviceId } });
  const others = await prisma.officeIdentify.findMany({ select: { code: true, deviceId: true } });
  const used = new Set(others.filter((o) => o.deviceId !== deviceId).map((o) => o.code));
  const code = existing?.code && !used.has(existing.code) ? existing.code : nextCode(used);
  await prisma.officeIdentify.upsert({
    where: { deviceId },
    create: { deviceId, code, userId: opts.userId || "", ip: opts.ip, seenAt: new Date() },
    update: { code, userId: opts.userId || existing?.userId || "", ip: opts.ip || existing?.ip || "", seenAt: new Date() },
  });
  return { until, code };
}

export async function bindIdentifyScreen(opts: { screenId: string; userId: string; label?: string }) {
  const row = await prisma.officeIdentify.findUnique({ where: { id: opts.screenId } });
  if (!row) throw new Error("Экран уже не на связи");
  const hosts = await readNeigh();
  const hit = hosts.find((h) => h.ip === row.ip);
  if (!hit) {
    throw new Error("MAC для этого IP пока не виден — нажмите «Сканировать», стоя в офисе, и сразу привяжите");
  }
  const user = await prisma.user.findFirst({ where: { id: opts.userId, deletedAt: null } });
  if (!user) throw new Error("Нет сотрудника");
  const st = await prisma.officeStation.upsert({
    where: { mac: hit.mac },
    create: {
      userId: opts.userId,
      mac: hit.mac,
      ipv4: hit.ip,
      label: (opts.label || "").trim().slice(0, 80) || `ПК ${row.code}`,
      lastSeenAt: new Date(),
    },
    update: {
      userId: opts.userId,
      ipv4: hit.ip,
      label: (opts.label || "").trim().slice(0, 80) || undefined,
      lastSeenAt: new Date(),
    },
  });
  return st;
}

export async function listIdentifyScreens() {
  const until = await identifyUntil();
  if (!until) return { until: null as string | null, screens: [] as never[] };
  const since = new Date(Date.now() - 5 * 60 * 1000);
  const rows = await prisma.officeIdentify.findMany({
    where: { seenAt: { gte: since } },
    orderBy: { code: "asc" },
  });
  const users = await prisma.user.findMany({
    where: { id: { in: rows.map((r) => r.userId).filter(Boolean) } },
    select: { id: true, lastName: true, firstName: true, middleName: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));
  const { fullName } = await import("./names");
  return {
    until: until.toISOString(),
    screens: rows.map((r) => {
      const u = r.userId ? byId.get(r.userId) : null;
      return {
        id: r.id,
        code: r.code,
        ip: r.ip.startsWith("192.168.") ? r.ip : "",
        userId: r.userId,
        userName: u ? fullName(u) : "",
        seenAt: r.seenAt.toISOString(),
      };
    }),
  };
}
