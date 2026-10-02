import type { NextRequest } from "next/server";
import { prisma } from "./prisma";
import { officeClock, officeYmd } from "./dates";
import { notify } from "./notify";

/** First office day that may be written into the timesheet. Earlier days stay blank. */
export const ATTENDANCE_FROM = "2026-10-02";

export function attendanceStartsLater(ymd = officeYmd()) {
  return ymd < ATTENDANCE_FROM;
}

export function attendanceClosedError() {
  const when = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Omsk",
    day: "numeric",
    month: "long",
  }).format(new Date(`${ATTENDANCE_FROM}T12:00:00+06:00`));
  return `Отметки прихода и ухода начнутся ${when}.`;
}

const TIMESHEET_SKIP: Array<[string, string]> = [
  ["ермилов", ""],
  ["ермилова", ""],
  ["балов", "павел"],
  ["балова", "ирина"],
  ["беляева", "ксения"],
  ["залуцкая", "людмила"],
  ["жлудова", "ольга"],
];

/** People who stay off the attendance sheet: both Ermilovs, named office roles, the admin account, and remote staff. */
export function onTimesheet(user: {
  login?: string | null;
  lastName?: string | null;
  firstName?: string | null;
  roleCode?: string | null;
}) {
  if ((user.roleCode || "") === "remote") return false;
  const login = (user.login || "").trim().toLowerCase();
  if (login === "admin") return false;
  const last = (user.lastName || "").trim().toLocaleLowerCase("ru");
  const first = (user.firstName || "").trim().toLocaleLowerCase("ru");
  if (last === "администратор") return false;
  return !TIMESHEET_SKIP.some(([l, f]) => last === l && (!f || first === f));
}

export const IN_GRACE_UNTIL = 10 * 60 + 15;
export const OUT_EARLY_BEFORE = 17 * 60 + 45;
export const MORNING_FROM = 9 * 60;
export const MORNING_TO = 11 * 60;
export const EVENING_FROM = 17 * 60;
export const EVENING_TO = 19 * 60;

export function isOfficeLanIp(ip: string) {
  const m = ip.trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 192 && b === 168) return true;
  if (a === 10 && b !== 8) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

export function requestClientIp(req: NextRequest) {
  return requestTrustedIp(req);
}

/** IP closest to this server (nginx x-real-ip or last X-Forwarded-For hop). */
export function requestTrustedIp(req: NextRequest) {
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const fwd = (req.headers.get("x-forwarded-for") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return fwd[fwd.length - 1] || "";
}

/** IP, как его видит офисный nginx, без Cloudflare. */
export function requestLanIp(req: NextRequest) {
  const parts = [
    req.headers.get("x-real-ip") || "",
    ...(req.headers.get("x-forwarded-for") || "").split(","),
    req.headers.get("cf-connecting-ip") || "",
  ]
    .map((s) => s.trim())
    .filter(Boolean);
  for (const ip of parts) {
    if (isOfficeLanIp(ip)) return ip;
  }
  return "";
}

function ipv4ToInt(ip: string) {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((n) => n > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

export function parseOfficeCidrs(raw: string) {
  return raw
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function ipInOffice(ip: string, cidrs: string[]) {
  const clean = ip.trim();
  if (!clean || clean === "127.0.0.1" || clean === "::1" || clean === "unknown") return false;
  for (const rule of cidrs) {
    if (rule === clean) return true;
    const [net, bitsRaw] = rule.split("/");
    if (!bitsRaw) continue;
    const ipN = ipv4ToInt(clean);
    const netN = ipv4ToInt(net);
    const bits = Number(bitsRaw);
    if (ipN == null || netN == null || bits < 0 || bits > 32) continue;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    if ((ipN & mask) === (netN & mask)) return true;
  }
  return false;
}

export function lanCidrFromIp(ip: string) {
  const n = ipv4ToInt(ip);
  if (n == null) return null;
  const a = (n >>> 24) & 255;
  const b = (n >>> 16) & 255;
  const c = (n >>> 8) & 255;
  if (a === 10) return `10.${b}.${c}.0/24`;
  if (a === 192 && b === 168) return `192.168.${c}.0/24`;
  if (a === 172 && b >= 16 && b <= 31) return `172.${b}.${c}.0/24`;
  return null;
}

export function parseLanList(raw: unknown) {
  const list = Array.isArray(raw)
    ? raw.map(String)
    : String(raw || "")
        .split(",")
        .map((s) => s.trim());
  const out: string[] = [];
  for (const item of list) {
    if (!ipv4ToInt(item)) continue;
    if (item === "127.0.0.1") continue;
    if (!out.includes(item)) out.push(item);
    if (out.length >= 8) break;
  }
  return out;
}

export function mergeOfficeNets(have: string[], ips: string[]) {
  const next = [...have];
  for (const ip of ips) {
    const cidr = lanCidrFromIp(ip) || ip;
    if (!next.includes(cidr) && !next.includes(ip)) next.push(cidr);
  }
  return next;
}

export async function officeCidrs() {
  const s = await prisma.appSettings.findUnique({ where: { id: "default" }, select: { officeCidrs: true } });
  return parseOfficeCidrs(s?.officeCidrs || "");
}

export async function isOnSite(ip: string, extra: string[] = []) {
  const cidrs = await officeCidrs();
  if (ipInOffice(ip, cidrs)) return true;
  return extra.some((x) => ipInOffice(x, cidrs));
}

function ymdInRange(ymd: string, from: string, to: string) {
  return ymd >= from && ymd <= to;
}

export const LEAVE_TYPES = ["time_off", "unpaid_leave", "vacation", "study_leave", "remote", "day_swap", "sick"] as const;

const RANGE_LEAVE = new Set(["unpaid_leave", "vacation", "study_leave", "remote", "sick"]);

export function leaveShort(type: string) {
  switch (type) {
    case "time_off":
      return "отгул";
    case "day_swap":
      return "замена";
    case "unpaid_leave":
      return "без содерж.";
    case "vacation":
      return "отпуск";
    case "study_leave":
      return "учебный";
    case "sick":
      return "больничный";
    case "remote":
      return "вне офиса";
    default:
      return "";
  }
}

export function leaveCoversYmd(type: string, payloadJson: string, ymd: string) {
  let p: Record<string, string> = {};
  try {
    p = JSON.parse(payloadJson || "{}") as Record<string, string>;
  } catch {
    p = {};
  }
  if (type === "time_off") {
    const a = p.date || "";
    const b = p.dateTo || a;
    return Boolean(a && ymdInRange(ymd, a, b));
  }
  if (type === "day_swap") return p.from === ymd;
  if (RANGE_LEAVE.has(type)) {
    const a = p.from || "";
    const b = p.to || a;
    return Boolean(a && ymdInRange(ymd, a, b));
  }
  return false;
}

export async function onApprovedLeave(userId: string, ymd: string) {
  const rows = await prisma.hrRequest.findMany({
    where: {
      authorId: userId,
      status: "accepted",
      type: { in: [...LEAVE_TYPES] },
    },
    select: { type: true, payloadJson: true },
  });
  return rows.some((row) => leaveCoversYmd(row.type, row.payloadJson, ymd));
}

async function raiseFlag(opts: { userId: string; ymd: string; kind: string; minutes?: number; detail?: string }) {
  await prisma.attendanceFlag.upsert({
    where: { userId_ymd_kind: { userId: opts.userId, ymd: opts.ymd, kind: opts.kind } },
    create: {
      userId: opts.userId,
      ymd: opts.ymd,
      kind: opts.kind,
      minutes: opts.minutes || 0,
      detail: opts.detail || "",
    },
    update: { minutes: opts.minutes || 0, detail: opts.detail || "" },
  });
}

export async function markIn(opts: {
  userId: string;
  ip: string;
  extraIps?: string[];
  source: "manual" | "auto" | "lan" | "gate";
  trust?: boolean;
}) {
  const clock = officeClock();
  if (attendanceStartsLater(clock.ymd)) {
    return { ok: false as const, error: attendanceClosedError() };
  }
  const extra = opts.extraIps || [];
  const onSite = opts.trust || opts.source === "lan" ? true : await isOnSite(opts.ip);
  if (!onSite) {
    await prisma.attendanceEvent.create({
      data: { userId: opts.userId, ymd: clock.ymd, kind: "deny_in", ip: opts.ip, detail: opts.source },
    });
    await raiseFlag({
      userId: opts.userId,
      ymd: clock.ymd,
      kind: "offsite_try",
      detail: `попытка прихода не из офиса (${[opts.ip, ...extra].filter(Boolean).join(", ")})`,
    });
    return { ok: false as const, error: "Отметиться можно только в офисе. Подключитесь к Wi‑Fi студии." };
  }
  const leave = await onApprovedLeave(opts.userId, clock.ymd);
  const existing = await prisma.attendanceDay.findUnique({
    where: { userId_ymd: { userId: opts.userId, ymd: clock.ymd } },
  });
  if (existing?.inAt) return { ok: true as const, day: existing, already: true };
  const day = await prisma.attendanceDay.upsert({
    where: { userId_ymd: { userId: opts.userId, ymd: clock.ymd } },
    create: {
      userId: opts.userId,
      ymd: clock.ymd,
      inAt: new Date(),
      inSource: opts.source,
      inIp: opts.ip,
    },
    update: { inAt: new Date(), inSource: opts.source, inIp: opts.ip },
  });
  await prisma.attendanceEvent.create({
    data: { userId: opts.userId, ymd: clock.ymd, kind: "in", ip: opts.ip, detail: opts.source },
  });
  if (!leave && clock.weekdayWork && clock.minutes > IN_GRACE_UNTIL) {
    await raiseFlag({
      userId: opts.userId,
      ymd: clock.ymd,
      kind: "late_in",
      minutes: clock.minutes - 10 * 60,
      detail: opts.source,
    });
  }
  return { ok: true as const, day, already: false };
}

export async function markOut(opts: {
  userId: string;
  ip: string;
  extraIps?: string[];
  source: "manual" | "auto" | "lan" | "gate";
  trust?: boolean;
}) {
  const clock = officeClock();
  if (attendanceStartsLater(clock.ymd)) {
    return { ok: false as const, error: attendanceClosedError() };
  }
  const extra = opts.extraIps || [];
  const onSite = opts.trust ? true : await isOnSite(opts.ip);
  if (!onSite) {
    await prisma.attendanceEvent.create({
      data: { userId: opts.userId, ymd: clock.ymd, kind: "deny_out", ip: opts.ip, detail: opts.source },
    });
    await raiseFlag({
      userId: opts.userId,
      ymd: clock.ymd,
      kind: "offsite_try",
      detail: `попытка ухода не из офиса (${[opts.ip, ...extra].filter(Boolean).join(", ")})`,
    });
    return { ok: false as const, error: "Отметить уход можно только из офиса. Подключитесь к Wi‑Fi студии." };
  }
  const existing = await prisma.attendanceDay.findUnique({
    where: { userId_ymd: { userId: opts.userId, ymd: clock.ymd } },
  });
  if (!existing?.inAt) return { ok: false as const, error: "Сначала отметьте приход" };
  if (existing.outAt) return { ok: true as const, day: existing, already: true };
  const day = await prisma.attendanceDay.update({
    where: { id: existing.id },
    data: { outAt: new Date(), outSource: opts.source, outIp: opts.ip },
  });
  await prisma.attendanceEvent.create({
    data: { userId: opts.userId, ymd: clock.ymd, kind: "out", ip: opts.ip, detail: opts.source },
  });
  const leave = await onApprovedLeave(opts.userId, clock.ymd);
  if (!leave && clock.weekdayWork && clock.minutes < OUT_EARLY_BEFORE) {
    await raiseFlag({
      userId: opts.userId,
      ymd: clock.ymd,
      kind: "early_out",
      minutes: 18 * 60 - clock.minutes,
      detail: opts.source,
    });
  }
  return { ok: true as const, day, already: false };
}

export async function presencePing(opts: { userId: string; ip: string; extraIps?: string[] }) {
  const clock = officeClock();
  const extra = opts.extraIps || [];
  const onSite = await isOnSite(opts.ip);
  if (!onSite) return { onSite: false, autoIn: false };
  const leave = await onApprovedLeave(opts.userId, clock.ymd);
  let autoIn = false;
  if (!leave && clock.weekdayWork && clock.minutes >= MORNING_FROM && clock.minutes < MORNING_TO) {
    const res = await markIn({ userId: opts.userId, ip: opts.ip, extraIps: extra, source: "auto" });
    autoIn = res.ok && !res.already;
  }
  return { onSite: true, autoIn };
}

export async function presenceSnapshot(userId: string, ip: string, extraIps: string[] = []) {
  const clock = officeClock();
  const [onSite, leave, day, station] = await Promise.all([
    isOnSite(ip),
    onApprovedLeave(userId, clock.ymd),
    prisma.attendanceDay.findUnique({ where: { userId_ymd: { userId, ymd: clock.ymd } } }),
    prisma.officeStation.findFirst({ where: { userId }, orderBy: { lastSeenAt: "desc" } }),
  ]);
  const cidrs = await officeCidrs();
  return {
    ymd: clock.ymd,
    onSite,
    officeConfigured: cidrs.length > 0,
    weekdayWork: clock.weekdayWork,
    leave,
    minutes: clock.minutes,
    morningWindow: clock.minutes >= MORNING_FROM && clock.minutes < MORNING_TO,
    eveningWindow: clock.minutes >= EVENING_FROM && clock.minutes < EVENING_TO,
    inAt: day?.inAt?.toISOString() || null,
    outAt: day?.outAt?.toISOString() || null,
    inSource: day?.inSource || "",
    stationBound: Boolean(station),
    stationMac: station?.mac || "",
  };
}

export async function tickPresence() {
  try {
    const { applyLanPresence } = await import("./office-lan");
    await applyLanPresence();
  } catch (e) {
    console.error("lan-scan", e);
  }
  const clock = officeClock();
  if (attendanceStartsLater(clock.ymd)) return;
  if (!clock.weekdayWork) return;
  const active = await prisma.user.findMany({
    where: { deletedAt: null, status: "active" },
    select: { id: true, login: true, lastName: true, firstName: true, role: { select: { code: true } } },
  });
  const tracked = active.filter((u) =>
    onTimesheet({ login: u.login, lastName: u.lastName, firstName: u.firstName, roleCode: u.role.code }),
  );
  const ids = tracked.map((u) => u.id);
  if (clock.minutes >= EVENING_FROM && clock.minutes < EVENING_TO) {
    const days = await prisma.attendanceDay.findMany({
      where: { ymd: clock.ymd, userId: { in: ids }, inAt: { not: null }, outAt: null, outRemindedAt: null },
    });
    for (const day of days) {
      if (await onApprovedLeave(day.userId, clock.ymd)) continue;
      await notify({
        userId: day.userId,
        title: "Отметьтесь об уходе",
        body: "Рабочий день до 18:00. Нажмите «Ушёл», пока вы ещё в офисе.",
        link: "/",
        urgency: "info",
      });
      await prisma.attendanceDay.update({ where: { id: day.id }, data: { outRemindedAt: new Date() } });
    }
  }
  if (clock.minutes >= 11 * 60 + 5 && clock.minutes < 12 * 60) {
    for (const u of tracked) {
      if (await onApprovedLeave(u.id, clock.ymd)) continue;
      const day = await prisma.attendanceDay.findUnique({
        where: { userId_ymd: { userId: u.id, ymd: clock.ymd } },
      });
      if (!day?.inAt) {
        await raiseFlag({ userId: u.id, ymd: clock.ymd, kind: "no_in", detail: "нет прихода к 11:00" });
      }
    }
  }
  if (clock.minutes >= 19 * 60 && clock.minutes < 20 * 60) {
    for (const u of tracked) {
      if (await onApprovedLeave(u.id, clock.ymd)) continue;
      const day = await prisma.attendanceDay.findUnique({
        where: { userId_ymd: { userId: u.id, ymd: clock.ymd } },
      });
      if (day?.inAt && !day.outAt) {
        await raiseFlag({ userId: u.id, ymd: clock.ymd, kind: "no_out", detail: "нет ухода к 19:00" });
      }
    }
  }
  if (clock.minutes >= 20 * 60) await closeForgotten(clock.ymd, clock.weekdayWork, new Set(ids));
}

async function closeForgotten(ymd: string, weekdayWork: boolean, tracked: Set<string>) {
  const open = await prisma.attendanceDay.findMany({
    where: { ymd, userId: { in: [...tracked] }, inAt: { not: null }, outAt: null },
  });
  for (const day of open) {
    if (await onApprovedLeave(day.userId, ymd)) continue;
    await raiseFlag({ userId: day.userId, ymd, kind: "forgot", detail: "нет ухода к 20:00" });
  }
  if (!weekdayWork) return;
  for (const id of tracked) {
    if (await onApprovedLeave(id, ymd)) continue;
    const day = await prisma.attendanceDay.findUnique({
      where: { userId_ymd: { userId: id, ymd } },
    });
    if (!day?.inAt) {
      await raiseFlag({ userId: id, ymd, kind: "forgot", detail: "нет отметки за день" });
    }
  }
}

export function flagLabel(kind: string) {
  if (kind === "late_in") return "Опоздание";
  if (kind === "no_in") return "Нет прихода";
  if (kind === "early_out") return "Ранний уход";
  if (kind === "no_out") return "Нет ухода";
  if (kind === "offsite_try") return "Попытка вне офиса";
  if (kind === "forgot") return "Забыл отметиться";
  return kind;
}

export { officeYmd };
