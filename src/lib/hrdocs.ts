import { inferGender } from "./gender";

export const HR_TYPES: {
  id: string;
  name: string;
  title: string;
  fields: Array<
    "date" | "dateTo" | "from" | "to" | "reason" | "body" | "subject" | "basis" | "arrived" | "due" | "notifyReason" | "makeup"
  >;
}[] = [
  {
    id: "time_off",
    name: "Отгул",
    title: "Заявление на отгул",
    fields: ["date", "basis", "reason"],
  },
  {
    id: "day_swap",
    name: "Замена рабочего дня",
    title: "Заявление о замене рабочего дня",
    fields: ["from", "to", "reason"],
  },
  {
    id: "unpaid_leave",
    name: "Отпуск без содержания",
    title: "Заявление на отпуск без сохранения заработной платы",
    fields: ["from", "to", "reason"],
  },
  {
    id: "vacation",
    name: "Ежегодный отпуск",
    title: "Заявление на ежегодный оплачиваемый отпуск",
    fields: ["from", "to"],
  },
  {
    id: "study_leave",
    name: "Учебный отпуск",
    title: "Заявление на учебный отпуск",
    fields: ["from", "to"],
  },
  {
    id: "sick",
    name: "Больничный",
    title: "Заявление об отсутствии по болезни",
    fields: ["from", "to", "reason"],
  },
  {
    id: "late",
    name: "Опоздание",
    title: "Объяснительная записка об опоздании",
    fields: ["date", "arrived", "due", "reason", "notifyReason", "makeup"],
  },
  {
    id: "explainer",
    name: "Объяснительная",
    title: "Объяснительная записка",
    fields: ["date", "body"],
  },
  {
    id: "memo",
    name: "Служебная записка",
    title: "Служебная записка",
    fields: ["subject", "body"],
  },
  {
    id: "remote",
    name: "Работа вне офиса",
    title: "Заявление о работе вне офиса",
    fields: ["from", "to", "reason"],
  },
];

export const HR_STATUS: Record<string, { label: string; tone: "draft" | "wait" | "ok" | "warn" | "bad" }> = {
  draft: { label: "Черновик", tone: "draft" },
  signed: { label: "Скан приложен", tone: "wait" },
  review: { label: "У руководителя", tone: "wait" },
  accepted: { label: "Согласовано", tone: "ok" },
  rejected: { label: "Отклонено", tone: "bad" },
  rework: { label: "На доработке", tone: "warn" },
};

export const HR_BASIS = [
  { id: "overtime", label: "за ранее отработанное время" },
  { id: "family", label: "по семейным обстоятельствам" },
  { id: "other", label: "иное" },
];

export function hrType(id: string) {
  return HR_TYPES.find((t) => t.id === id);
}

export function ruDate(iso: string) {
  if (!iso) return "«__» ________ 20__ г.";
  const [y, m, d] = iso.split("-");
  const months = [
    "января",
    "февраля",
    "марта",
    "апреля",
    "мая",
    "июня",
    "июля",
    "августа",
    "сентября",
    "октября",
    "ноября",
    "декабря",
  ];
  const mi = Number(m) - 1;
  return `«${Number(d)}» ${months[mi] || m} ${y} г.`;
}

function ruTime(t: string) {
  const m = /^(\d{1,2}):(\d{2})/.exec(t || "");
  if (!m) return "_____";
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

function minutesLate(due: string, arrived: string) {
  const a = /^(\d{1,2}):(\d{2})/.exec(arrived || "");
  const d = /^(\d{1,2}):(\d{2})/.exec(due || "");
  if (!a || !d) return 0;
  return Number(a[1]) * 60 + Number(a[2]) - (Number(d[1]) * 60 + Number(d[2]));
}

function minutesWord(n: number) {
  const abs = Math.abs(n);
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return `${abs} минуту`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${abs} минуты`;
  return `${abs} минут`;
}

function makeupLine(date: string, from: string, to: string) {
  const when = date ? ruDate(date) : "«___» __________ 20__ г.";
  const a = from ? ruTime(from) : "_____";
  const b = to ? ruTime(to) : "_____";
  return `${when} с ${a} до ${b}.`;
}

export type LetterWho = {
  gender?: string | null;
  login?: string | null;
  firstName?: string | null;
  middleName?: string | null;
};

export function letterBody(type: string, p: Record<string, string>, who?: LetterWho): string[] {
  const basis = HR_BASIS.find((b) => b.id === p.basis)?.label || p.basis || "";
  switch (type) {
    case "time_off":
      return [
        `Прошу предоставить отгул ${ruDate(p.date)}${p.dateTo && p.dateTo !== p.date ? ` по ${ruDate(p.dateTo)}` : ""}${basis ? ` ${basis}` : ""}${p.reason ? ` (${p.reason})` : ""}.`,
      ];
    case "day_swap":
      return [
        `Прошу заменить рабочий день ${ruDate(p.from)} на ${ruDate(p.to)}${p.reason ? ` в связи с тем, что ${p.reason}` : ""}.`,
      ];
    case "unpaid_leave":
      return [
        `Прошу предоставить отпуск без сохранения заработной платы с ${ruDate(p.from)} по ${ruDate(p.to)}${p.reason ? ` по причине: ${p.reason}` : ""}.`,
      ];
    case "vacation":
      return [`Прошу предоставить ежегодный оплачиваемый отпуск с ${ruDate(p.from)} по ${ruDate(p.to)}.`]
    case "study_leave":
      return [`Прошу предоставить учебный отпуск с ${ruDate(p.from)} по ${ruDate(p.to)}.`];
    case "sick":
      return [
        `Прошу учесть период нетрудоспособности с ${ruDate(p.from)} по ${ruDate(p.to)}${p.reason ? ` (${p.reason})` : ""}.`,
      ];
    case "late": {
      const g = who?.gender === "m" || who?.gender === "f" ? who.gender : inferGender(who || {});
      const pribyl = g === "f" ? "прибыла" : "прибыл";
      const smogla = g === "f" ? "не смогла" : "не смог";
      const mins = minutesLate(p.due, p.arrived);
      const minsText = mins > 0 ? minutesWord(mins) : p.minutes || "_____ минут";
      const lines = [
        `${p.date ? ruDate(p.date) : "«__» ________ 20__ г."} я ${pribyl} на работу в ${ruTime(p.arrived)} вместо установленного времени начала рабочего дня — ${ruTime(p.due)}. Опоздание составило ${minsText}.`,
        `Причина опоздания: ${p.reason || "________________"}.${
          p.notifyReason ? ` Своевременно предупредить руководителя ${smogla} по причине ${p.notifyReason}.` : ""
        }`,
        "Приношу извинения за опоздание. Обязуюсь отработать пропущенное рабочее время в полном объёме в следующие даты:",
        makeupLine(p.makeup1Date, p.makeup1From, p.makeup1To),
        makeupLine(p.makeup2Date, p.makeup2From, p.makeup2To),
        makeupLine(p.makeup3Date, p.makeup3From, p.makeup3To),
        "В дальнейшем обязуюсь соблюдать установленный режим рабочего времени и своевременно сообщать о возможных задержках.",
      ];
      return lines;
    }
    case "explainer":
      return [
        p.date ? `По факту события ${ruDate(p.date)} сообщаю следующее.` : "Сообщаю следующее.",
        p.body || "",
      ].filter(Boolean);
    case "memo":
      return [p.subject ? `Тема: ${p.subject}` : "", p.body || ""].filter(Boolean);
    case "remote":
      return [
        `Прошу разрешить работу вне офиса с ${ruDate(p.from)} по ${ruDate(p.to)}${p.reason ? ` (${p.reason})` : ""}.`,
      ];
    default:
      return [p.body || p.reason || ""];
  }
}
