export const OFFICE_TZ = "Asia/Omsk";

export function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: OFFICE_TZ,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function fmtDateTime(d: Date | string | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: OFFICE_TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function officeYmd(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: OFFICE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function officeClock(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: OFFICE_TZ,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value || "";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  return {
    ymd: `${get("year")}-${get("month")}-${get("day")}`,
    weekday: weekday < 0 ? d.getDay() : weekday,
    hour,
    minute,
    minutes: hour * 60 + minute,
    weekdayWork: weekday >= 1 && weekday <= 5,
  };
}

export function fmtTimeOmsk(d: Date | string | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: OFFICE_TZ,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function officeTodayNoon(d = new Date()) {
  return new Date(`${officeYmd(d)}T12:00:00+06:00`);
}

/** Last calendar day of the office month that contains `d` (noon Omsk). */
export function lastOfficeDayOfMonth(d: Date) {
  const ymd = officeYmd(d);
  const y = Number(ymd.slice(0, 4));
  const m = Number(ymd.slice(5, 7));
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  const nextNoon = new Date(`${nextY}-${String(nextM).padStart(2, "0")}-01T12:00:00+06:00`);
  return new Date(nextNoon.getTime() - 24 * 60 * 60 * 1000);
}

export function aoDateFromReceipts(receipts: { occurredAt: Date | string | null | undefined }[]): Date | null {
  let latest: Date | null = null;
  for (const r of receipts) {
    if (!r.occurredAt) continue;
    const dt = r.occurredAt instanceof Date ? r.occurredAt : new Date(r.occurredAt);
    if (Number.isNaN(dt.getTime())) continue;
    if (!latest || dt > latest) latest = dt;
  }
  return latest ? lastOfficeDayOfMonth(latest) : null;
}

export const moscowYmd = officeYmd;

export function officeDateParts(d: Date) {
  const fmt = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("ru-RU", { timeZone: OFFICE_TZ, ...opts }).format(d);
  return {
    date: fmt({ day: "2-digit", month: "2-digit", year: "numeric" }),
    day: fmt({ day: "numeric" }),
    month: fmt({ month: "long" }),
    year2: fmt({ year: "2-digit" }),
  };
}

export function utcMonthDay(d: Date) {
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${m}-${day}`;
}

export function fmtBirth(d: Date | string | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
  }).format(date);
}

export function ageYears(birth: Date, onYmd: string) {
  const [y] = onYmd.split("-").map(Number);
  let age = y - birth.getUTCFullYear();
  const todayMd = onYmd.slice(5);
  const birthMd = utcMonthDay(birth);
  if (todayMd < birthMd) age -= 1;
  return age;
}

export function toDateInput(d: Date | null | undefined) {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

export function toDatetimeLocal(d: Date | null | undefined) {
  if (!d) return "";
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
