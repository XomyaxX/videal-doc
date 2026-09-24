import { prisma } from "./prisma";
import { officeYmd } from "./dates";
import { inferGender } from "./gender";
import { fullName } from "./names";
import { notify } from "./notify";

export const DUTY = {
  trash: { kind: "trash" as const, title: "Вынос мусора", gender: "m" as const, line: "выносите мусор" },
  clean: { kind: "clean" as const, title: "Уборка", gender: "f" as const, line: "уборка за вами" },
};

const WEEKDAY_RU = ["", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"];
const WEEKDAY_SHORT = ["", "пн", "вт", "ср", "чт", "пт", "сб", "вс"];

function isDutyExempt(p: {
  login: string;
  lastName: string;
  firstName: string;
  role: { code: string };
  department: { name: string } | null;
  position: { name: string } | null;
}) {
  if (["manager", "admin", "superadmin", "sublead", "aho"].includes(p.role.code)) return true;
  if ((p.login || "").toLowerCase() === "balova") return true;
  if (p.lastName === "Балова" && p.firstName === "Ирина") return true;
  const n = (p.department?.name || "").toLowerCase();
  if (n.includes("хозяйствен") || n === "ахо" || n.includes("кадр")) return true;
  const pos = (p.position?.name || "").toLowerCase();
  return pos.includes("руководител") || pos.includes("директор");
}

export function mondayOfYmd(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() - (dow - 1));
  return dt.toISOString().slice(0, 10);
}

export function addDaysYmd(ymd: string, days: number) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function weekdayIso(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCDay() || 7;
}

export function isWorkday(ymd: string) {
  return weekdayIso(ymd) <= 5;
}

export function weekIndex(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  return Math.ceil(((dt.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/** Consecutive workdays (Mon–Fri) so the trash roster rides day by day, not week by week. */
export function workdayIndex(ymd: string) {
  const dow = Math.min(weekdayIso(ymd), 5);
  return (Math.abs(weekIndex(ymd)) - 1) * 5 + (dow - 1);
}

export function fmtWeek(mon: string) {
  const fri = addDaysYmd(mon, 4);
  const a = mon.split("-");
  const b = fri.split("-");
  return `${Number(a[2])}–${Number(b[2])} ${monthRu(Number(a[1]))} ${a[0]}`;
}

export function fmtDay(ymd: string) {
  const [y, m, d] = ymd.split("-");
  return `${Number(d)} ${monthRu(Number(m))} ${y}, ${WEEKDAY_RU[weekdayIso(ymd)]}`;
}

export function fmtDayShort(ymd: string) {
  const [y, m, d] = ymd.split("-");
  return `${WEEKDAY_SHORT[weekdayIso(ymd)]} ${Number(d)} ${monthRu(Number(m))}`;
}

function monthRu(n: number) {
  return ["", "января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"][n];
}

export type DutyPerson = { id: string; name: string; lastName: string; firstName: string; photoFileId: string };

function personGender(p: { gender: string; login: string; firstName: string; middleName: string }): "m" | "f" | "" {
  if (p.gender === "m" || p.gender === "f") return p.gender;
  return inferGender(p);
}

export async function officeStaff(): Promise<DutyPerson[]> {
  const [men, women] = await Promise.all([dutyRoster("m"), dutyRoster("f")]);
  return [...men, ...women].sort(
    (a, b) => a.lastName.localeCompare(b.lastName, "ru") || a.firstName.localeCompare(b.firstName, "ru"),
  );
}

export async function dutyRoster(gender: "m" | "f"): Promise<DutyPerson[]> {
  const people = await prisma.user.findMany({
    where: { deletedAt: null, status: "active" },
    include: { role: true, department: true, position: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  return people
    .filter((p) => !isDutyExempt(p) && personGender(p) === gender)
    .map((p) => ({
      id: p.id,
      name: fullName(p),
      lastName: p.lastName,
      firstName: p.firstName,
      photoFileId: p.photoFileId,
    }));
}

export function pickByWeek(roster: DutyPerson[], ymd: string) {
  if (!roster.length) return null;
  return roster[Math.abs(weekIndex(ymd)) % roster.length];
}

export type DutyOverrides = Record<string, { clean?: string[]; trash?: string }>;

async function loadDutyOverrides(): Promise<DutyOverrides> {
  const s = await prisma.appSettings.findUnique({ where: { id: "default" }, select: { dutyOverrides: true } });
  try {
    const raw = JSON.parse(s?.dutyOverrides || "{}") as DutyOverrides;
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

function byIds(roster: DutyPerson[], ids: string[] | undefined) {
  if (!ids?.length) return null;
  const found = ids
    .map((id) => roster.find((p) => p.id === id))
    .filter((p): p is DutyPerson => Boolean(p));
  return found.length ? found : null;
}

export function pickByWorkday(roster: DutyPerson[], ymd: string, overrides: DutyOverrides = {}) {
  const over = overrides[ymd]?.trash;
  if (over) {
    const p = roster.find((x) => x.id === over);
    if (p) return p;
  }
  if (!roster.length || !isWorkday(ymd)) return null;
  return roster[Math.abs(workdayIndex(ymd)) % roster.length];
}

export function isCleanDay(ymd: string) {
  const d = weekdayIso(ymd);
  return d === 2 || d === 5;
}

/** Consecutive Tue/Fri slots so the cleaning pair rides, not a fixed couple. */
export function cleanSlotIndex(ymd: string) {
  const dow = weekdayIso(ymd);
  const inWeek = dow >= 5 ? 1 : 0;
  return (Math.abs(weekIndex(ymd)) - 1) * 2 + inWeek;
}

export function pickCleanPair(roster: DutyPerson[], ymd: string, overrides: DutyOverrides = {}): DutyPerson[] {
  const over = byIds(roster, overrides[ymd]?.clean);
  if (over) return over;
  if (!roster.length || !isCleanDay(ymd)) return [];
  if (roster.length === 1) return [roster[0]];
  const slot = Math.abs(cleanSlotIndex(ymd));
  const a = roster[(slot * 2) % roster.length];
  const b = roster[(slot * 2 + 1) % roster.length];
  if (a.id === b.id) return [a];
  return [a, b];
}

export function pickDuty(roster: DutyPerson[], ymd: string) {
  return pickByWeek(roster, ymd);
}

export async function dutyForWeek(ymd = officeYmd()) {
  const mon = mondayOfYmd(ymd);
  const [men, women, overrides] = await Promise.all([dutyRoster("m"), dutyRoster("f"), loadDutyOverrides()]);
  return {
    monday: mon,
    friday: addDaysYmd(mon, 4),
    label: fmtWeek(mon),
    today: ymd,
    todayLabel: fmtDay(ymd),
    trash: pickByWorkday(men, ymd, overrides),
    clean: pickCleanPair(women, ymd, overrides),
    men,
    women,
    overrides,
  };
}

export function upcomingWeeks(roster: DutyPerson[], fromYmd: string, count = 12) {
  const mon0 = mondayOfYmd(fromYmd);
  const rows: { monday: string; friday: string; label: string; person: DutyPerson | null }[] = [];
  for (let i = 0; i < count; i++) {
    const monday = addDaysYmd(mon0, i * 7);
    rows.push({
      monday,
      friday: addDaysYmd(monday, 4),
      label: fmtWeek(monday),
      person: pickByWeek(roster, monday),
    });
  }
  return rows;
}

export function upcomingWorkdays(roster: DutyPerson[], fromYmd: string, count = 20, overrides: DutyOverrides = {}) {
  const rows: { ymd: string; label: string; person: DutyPerson | null }[] = [];
  let ymd = mondayOfYmd(fromYmd);
  while (rows.length < count) {
    if (isWorkday(ymd)) {
      rows.push({ ymd, label: fmtDayShort(ymd), person: pickByWorkday(roster, ymd, overrides) });
    }
    ymd = addDaysYmd(ymd, 1);
  }
  return rows;
}

export function upcomingCleanDays(roster: DutyPerson[], fromYmd: string, count = 16, overrides: DutyOverrides = {}) {
  const rows: { ymd: string; label: string; people: DutyPerson[] }[] = [];
  let ymd = mondayOfYmd(fromYmd);
  while (rows.length < count) {
    if (isCleanDay(ymd)) {
      rows.push({ ymd, label: fmtDayShort(ymd), people: pickCleanPair(roster, ymd, overrides) });
    }
    ymd = addDaysYmd(ymd, 1);
  }
  return rows;
}

export async function tickDuty() {
  const ymd = officeYmd();
  const settings = await prisma.appSettings.findUnique({ where: { id: "default" } });
  if (settings?.lastDutyYmd === ymd) return;
  const now = new Date();
  const dow = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Omsk", weekday: "short" }).format(now);
  if (dow === "Sat" || dow === "Sun") {
    await prisma.appSettings.update({ where: { id: "default" }, data: { lastDutyYmd: ymd } });
    return;
  }
  const cur = await dutyForWeek(ymd);
  if (cur.trash) {
    await notify({
      userId: cur.trash.id,
      title: "Вынос мусора",
      body: `Сегодня (${fmtDayShort(ymd)}) ${DUTY.trash.line}.`,
      link: "/duty",
      urgency: "info",
    });
  }
  for (const p of cur.clean) {
    const other = cur.clean
      .filter((x) => x.id !== p.id)
      .map((x) => x.name)
      .join(", ");
    await notify({
      userId: p.id,
      title: "Уборка",
      body: other
        ? `Сегодня (${fmtDayShort(ymd)}) ${DUTY.clean.line}, вместе с ${other}.`
        : `Сегодня (${fmtDayShort(ymd)}) ${DUTY.clean.line}.`,
      link: "/duty",
      urgency: "info",
    });
  }
  await prisma.appSettings.update({ where: { id: "default" }, data: { lastDutyYmd: ymd } });
}
