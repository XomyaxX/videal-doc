import type { NextRequest } from "next/server";
import { prisma } from "./prisma";
import { officeClock, officeYmd } from "./dates";
import { notify } from "./notify";

export const IN_GRACE_UNTIL = 10 * 60 + 15;
export const OUT_EARLY_BEFORE = 17 * 60 + 45;
export const MORNING_FROM = 9 * 60;
export const MORNING_TO = 11 * 60;
export const EVENING_FROM = 17 * 60;
export const EVENING_TO = 19 * 60;

export function requestClientIp(req: NextRequest) {
  const cf = req.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
  return fwd;
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

export async function onApprovedLeave(userId: string, ymd: string) {
  const rows = await prisma.hrRequest.findMany({
    where: {
      authorId: userId,
      status: "accepted",
      type: { in: ["time_off", "unpaid_leave", "vacation", "remote", "day_swap", "sick"] },
    },
    select: { type: true, payloadJson: true },
  });
  for (const row of rows) {
    let p: Record<string, string> = {};
    try {
      p = JSON.parse(row.payloadJson || "{}") as Record<string, string>;
    } catch {
      p = {};
    }
    if (row.type === "time_off") {
      const a = p.date || "";
      const b = p.dateTo || a;
      if (a && ymdInRange(ymd, a, b)) return true;
    }
    if (row.type === "day_swap" && p.from === ymd) return true;
    if (["unpaid_leave", "vacation", "remote", "sick"].includes(row.type)) {
      const a = p.from || "";
      const b = p.to || a;
      if (a && ymdInRange(ymd, a, b)) return true;
    }
  }
  return false;
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

export async function markIn(opts: { userId: string; ip: string; extraIps?: string[]; source: "manual" | "auto" }) {
  const clock = officeClock();
  const extra = opts.extraIps || [];
  const onSite = await isOnSite(opts.ip, extra);
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

export async function markOut(opts: { userId: string; ip: string; extraIps?: string[]; source: "manual" | "auto" }) {
  const clock = officeClock();
  const extra = opts.extraIps || [];
  const onSite = await isOnSite(opts.ip, extra);
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
  const onSite = await isOnSite(opts.ip, extra);
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
  const [onSite, leave, day] = await Promise.all([
    isOnSite(ip, extraIps),
    onApprovedLeave(userId, clock.ymd),
    prisma.attendanceDay.findUnique({ where: { userId_ymd: { userId, ymd: clock.ymd } } }),
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
  };
}

export async function tickPresence() {
  const clock = officeClock();
  if (!clock.weekdayWork) return;
  const active = await prisma.user.findMany({
    where: { deletedAt: null, status: "active" },
    select: { id: true },
  });
  const ids = active.map((u) => u.id);
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
    for (const u of active) {
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
    for (const u of active) {
      if (await onApprovedLeave(u.id, clock.ymd)) continue;
      const day = await prisma.attendanceDay.findUnique({
        where: { userId_ymd: { userId: u.id, ymd: clock.ymd } },
      });
      if (day?.inAt && !day.outAt) {
        await raiseFlag({ userId: u.id, ymd: clock.ymd, kind: "no_out", detail: "нет ухода к 19:00" });
      }
    }
  }
}

export function flagLabel(kind: string) {
  if (kind === "late_in") return "Опоздание";
  if (kind === "no_in") return "Нет прихода";
  if (kind === "early_out") return "Ранний уход";
  if (kind === "no_out") return "Нет ухода";
  if (kind === "offsite_try") return "Попытка вне офиса";
  return kind;
}

export { officeYmd };
