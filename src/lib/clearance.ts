export const CLEARANCE_REASON: Record<string, string> = {
  dismissal: "Увольнение",
  transfer: "Перевод",
  other: "Иное",
};

export const CLEARANCE_STATUS: Record<string, { label: string; tone: "draft" | "wait" | "ok" | "bad" }> = {
  open: { label: "Открыт", tone: "wait" },
  done: { label: "Закрыт", tone: "ok" },
  cancelled: { label: "Отменён", tone: "draft" },
};

export const SIGN_BLOCKS = [
  { id: "aho", title: "Специалист АХО", note: "Передано:\nОборудование за инвентарными номерами:\n", signerRole: "" },
  {
    id: "acc",
    title: "Отдел бухгалтерского учета и отчетности",
    note: "Задолженности не имеет /имеет:",
    signerRole: "Бухгалтер",
  },
  {
    id: "isb",
    title: "Служба информационной безопасности",
    note: "Доступы к информационным и программным ресурсам: закрыты",
    signerRole: "",
  },
  { id: "curator", title: "Куратор проектов", note: "Сдано:", signerRole: "" },
] as const;

export type ClearancePrintBlock = {
  id: string;
  title: string;
  note: string;
  signerRole: string;
  signerName: string;
};

export type ClearancePrint = {
  fullName: string;
  workplace: string;
  position: string;
  dismissedAt: string;
  blocks: ClearancePrintBlock[];
};

export function toClearanceYmd(raw: string, fallback = "") {
  const s = String(raw || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const ru = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (ru) return `${ru[3]}-${ru[2].padStart(2, "0")}-${ru[1].padStart(2, "0")}`;
  return fallback;
}

export function formatClearanceDate(raw: string) {
  const ymd = toClearanceYmd(raw);
  if (!ymd) return raw || "";
  const [y, m, d] = ymd.split("-");
  return `${d}.${m}.${y}`;
}

export function defaultClearancePrint(opts: {
  fullName: string;
  workplace: string;
  position: string;
  dismissedAt?: string;
  equipment?: { title: string; invNo: string; qty: number }[];
}): ClearancePrint {
  const eq = (opts.equipment || []).filter((x) => x.title);
  const ahoList = eq.length
    ? eq.map((x) => `— ${x.title}${x.invNo ? ` инв. ${x.invNo}` : ""}${x.qty > 1 ? ` ×${x.qty}` : ""}`).join("\n")
    : "";
  return {
    fullName: opts.fullName,
    workplace: opts.workplace,
    position: opts.position,
    dismissedAt: opts.dismissedAt || "",
    blocks: SIGN_BLOCKS.map((b) => ({
      id: b.id,
      title: b.title,
      note: b.id === "aho" ? `${b.note}${ahoList}` : b.note,
      signerRole: b.signerRole,
      signerName: "",
    })),
  };
}

export function parseClearancePrint(raw: string | null | undefined, fallback: ClearancePrint): ClearancePrint {
  try {
    const v = JSON.parse(raw || "");
    if (!v || typeof v !== "object") return fallback;
    const blocks = Array.isArray(v.blocks) ? v.blocks : fallback.blocks;
    const byId = Object.fromEntries(fallback.blocks.map((b) => [b.id, b]));
    return {
      fullName: String(v.fullName ?? fallback.fullName),
      workplace: String(v.workplace ?? fallback.workplace),
      position: String(v.position ?? fallback.position),
      dismissedAt: toClearanceYmd(String(v.dismissedAt ?? ""), fallback.dismissedAt),
      blocks: fallback.blocks.map((def) => {
        const hit = blocks.find((b: { id?: string }) => b?.id === def.id) || byId[def.id];
        return {
          id: def.id,
          title: String(hit?.title ?? def.title),
          note: String(hit?.note ?? def.note),
          signerRole: String(hit?.signerRole ?? def.signerRole),
          signerName: String(hit?.signerName ?? ""),
        };
      }),
    };
  } catch {
    return fallback;
  }
}
