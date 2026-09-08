export const HR_TYPES: {
  id: string;
  name: string;
  title: string;
  fields: Array<"date" | "dateTo" | "from" | "to" | "reason" | "body" | "subject" | "basis">;
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
    id: "sick",
    name: "Больничный",
    title: "Заявление об отсутствии по болезни",
    fields: ["from", "to", "reason"],
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
  accepted: { label: "Принято", tone: "ok" },
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

export function letterBody(type: string, p: Record<string, string>): string[] {
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
    case "sick":
      return [
        `Прошу учесть период нетрудоспособности с ${ruDate(p.from)} по ${ruDate(p.to)}${p.reason ? ` (${p.reason})` : ""}.`,
      ];
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
