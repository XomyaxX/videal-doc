export const REQUEST_CATEGORIES: { id: string; label: string }[] = [
  { id: "software", label: "ПО" },
  { id: "hardware", label: "Оборудование" },
  { id: "subscription", label: "Подписка" },
  { id: "ai", label: "Нейросеть" },
  { id: "other", label: "Другое" },
];

export const REQUEST_UNITS = ["шт", "мес", "лицензия"];

export const REQUEST_STATUS: Record<string, { label: string; tone: "draft" | "wait" | "ok" | "warn" | "bad" }> = {
  draft: { label: "Черновик", tone: "draft" },
  submitted: { label: "У АХО", tone: "wait" },
  pricing: { label: "АХО считает сумму", tone: "wait" },
  review: { label: "На согласовании", tone: "wait" },
  to_pay: { label: "К выплате", tone: "wait" },
  paid: { label: "Деньги получены, закупаем", tone: "warn" },
  done: { label: "Выполнено", tone: "ok" },
  rejected: { label: "Отклонён", tone: "bad" },
  rework: { label: "На доработке", tone: "warn" },
};

export function categoryLabel(id: string) {
  return REQUEST_CATEGORIES.find((c) => c.id === id)?.label || id;
}

export const FUND_FROM_PURCHASE: Record<string, string> = {
  review: "review",
  to_pay: "to_pay",
  paid: "paid",
  rejected: "rejected",
  rework: "rework",
};
