export const AUDIT_ACTIONS = {
  found: { label: "На месте", tone: "ok" as const },
  transfer: { label: "Передать", tone: "wait" as const },
  question: { label: "Не найден", tone: "bad" as const },
};

export const ITEM_STATUS = {
  ok: { label: "в учёте", tone: "ok" as const },
  question: { label: "под вопросом", tone: "wait" as const },
};
