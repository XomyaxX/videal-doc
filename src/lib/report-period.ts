import { OFFICE_TZ, officeYmd } from "./dates";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Срок АО-1: до 5-го числа. Выдача 1-го → 5-е этого месяца; выдача 5-го и позже → 5-е следующего. */
export function reportDueYmd(issuedYmd: string): string {
  const [y, m, d] = issuedYmd.split("-").map(Number);
  if (!y || !m || !d) return issuedYmd;
  if (d < 5) return `${y}-${pad(m)}-05`;
  const next = m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };
  return `${next.y}-${pad(next.m)}-05`;
}

export function issuedYmd(row: { paidAt?: Date | null; neededAt?: Date | null; createdAt: Date }): string {
  return officeYmd(row.paidAt || row.neededAt || row.createdAt);
}

export function daysUntilYmd(target: string, today = officeYmd()): number {
  const a = Date.parse(`${today}T12:00:00+06:00`);
  const b = Date.parse(`${target}T12:00:00+06:00`);
  return Math.round((b - a) / 86400000);
}

export function dueDateParts(ymd: string) {
  const d = new Date(`${ymd}T12:00:00+06:00`);
  const fmt = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("ru-RU", { timeZone: OFFICE_TZ, ...opts }).format(d);
  return {
    day: fmt({ day: "2-digit" }),
    month: fmt({ month: "long" }),
    year: fmt({ year: "numeric" }),
  };
}

export function dueLabel(ymd: string) {
  const p = dueDateParts(ymd);
  return `${p.day} ${p.month} ${p.year}`;
}
