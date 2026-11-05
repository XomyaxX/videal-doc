import { fmtDate, officeYmd } from "@/lib/dates";
import { ORG_REQUISITES } from "@/lib/org";

export const WRITEOFF_REASONS = ["unusable", "obsolete", "lost", "disposal", "other"] as const;

export type WriteOffReason = (typeof WRITEOFF_REASONS)[number];

export const WRITEOFF_REASON: Record<WriteOffReason, string> = {
  unusable: "Непригодно к эксплуатации",
  obsolete: "Моральный износ",
  lost: "Утрата",
  disposal: "Передача в утиль",
  other: "Иное",
};

export const WRITEOFF_STATUS: Record<string, { label: string; tone: "draft" | "wait" | "ok" | "bad" }> = {
  open: { label: "Черновик", tone: "wait" },
  done: { label: "Списан", tone: "ok" },
  cancelled: { label: "Отменён", tone: "draft" },
};

export type CommissionMember = { fio: string; position: string };

export type WriteOffPrintLine = {
  title: string;
  invNo: string;
  qty: number;
  reason: string;
};

export type WriteOffPrint = {
  org: string;
  inn: string;
  number: string;
  actDate: string;
  reason: string;
  reasonLabel: string;
  reasonText: string;
  basis: string;
  note: string;
  conclusion: string;
  directorTitle: string;
  directorName: string;
  commission: CommissionMember[];
  lines: WriteOffPrintLine[];
  totalPositions: number;
  totalQty: number;
};

export type WriteOffPickItem = {
  id: string;
  invNo: string;
  name: string;
  qty: number;
  holder: string;
};

export type WriteOffLineDTO = {
  id: string;
  inventoryItemId: string;
  title: string;
  invNo: string;
  qty: number;
  reason: string;
  note: string;
};

export type WriteOffSheetDTO = {
  id: string;
  number: string;
  actDate: string;
  status: string;
  reason: string;
  reasonText: string;
  basis: string;
  note: string;
  commission: CommissionMember[];
  createdAt: string;
  closedAt: string | null;
  author: string;
  lines: WriteOffLineDTO[];
};

export class WriteOffError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "WriteOffError";
    this.status = status;
  }
}

export function canWriteOff(user: { roleCode: string; permissions: string[] }) {
  return user.roleCode === "admin" || user.roleCode === "superadmin" || user.permissions.includes("inventory.manage");
}

export function normalizeReason(raw: unknown, fallback: WriteOffReason = "unusable"): WriteOffReason {
  const s = String(raw ?? "");
  return (WRITEOFF_REASONS as readonly string[]).includes(s) ? (s as WriteOffReason) : fallback;
}

export function normalizeLineReason(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  return (WRITEOFF_REASONS as readonly string[]).includes(s) ? s : "";
}

export function reasonLabel(reason: string, reasonText = "") {
  if (reason === "other") {
    const text = reasonText.trim();
    return text ? `Иное: ${text}` : WRITEOFF_REASON.other;
  }
  return WRITEOFF_REASON[reason as WriteOffReason] || reason;
}

export function lineReasonLabel(sheetReason: string, lineReason: string) {
  if (!lineReason || lineReason === sheetReason) return "";
  return reasonLabel(lineReason);
}

export function defaultWriteOffCommission(): CommissionMember[] {
  return [
    { fio: "Балов П.А.", position: "Специалист АХО" },
    { fio: "Цвяк А.Н.", position: "Специалист АХО" },
    { fio: "Жлудова О.В.", position: "Бухгалтер" },
  ];
}

export function parseCommission(raw: unknown): CommissionMember[] {
  let arr: unknown = raw;
  if (typeof raw === "string") {
    try {
      arr = JSON.parse(raw || "[]");
    } catch {
      arr = [];
    }
  }
  const list = Array.isArray(arr) ? arr : [];
  const mapped = list.slice(0, 3).map((x) => {
    const row = x && typeof x === "object" ? (x as Record<string, unknown>) : {};
    return {
      fio: String(row.fio ?? row.name ?? "").trim().slice(0, 120),
      position: String(row.position ?? row.role ?? "").trim().slice(0, 120),
    };
  });
  while (mapped.length < 3) mapped.push({ fio: "", position: "" });
  return mapped.slice(0, 3);
}

export function commissionReady(members: CommissionMember[]) {
  return members.some((m) => m.fio.trim());
}

export function parseActDate(raw: unknown, fallback = new Date()) {
  const s = String(raw ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T12:00:00.000Z`);
  return fallback;
}

export function actDateYmd(d: Date) {
  return officeYmd(d);
}

export function clip(raw: unknown, max: number) {
  return String(raw ?? "").trim().slice(0, max);
}

export function parseQty(raw: unknown) {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 1_000_000);
}

export function itemTitle(it: { name: string; pcHost?: string | null }) {
  return it.pcHost ? `${it.name} (${it.pcHost})` : it.name;
}

export type ManualLineInput = {
  title: string;
  invNo: string;
  qty: number;
  reason: string;
  note: string;
};

export function readManual(raw: unknown): ManualLineInput | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const title = clip(row.title, 300);
  if (!title) return null;
  return {
    title,
    invNo: clip(row.invNo, 80),
    qty: parseQty(row.qty),
    reason: normalizeLineReason(row.reason),
    note: clip(row.note, 400),
  };
}

export function readIdList(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  const ids = raw.map((x) => String(x || "").trim()).filter(Boolean);
  return [...new Set(ids)];
}

export function buildWriteOffPrint(opts: {
  number: string;
  actDate: Date;
  reason: string;
  reasonText: string;
  basis: string;
  note: string;
  commission: CommissionMember[];
  lines: { title: string; invNo: string; qty: number; reason: string }[];
  directorTitle?: string;
  directorName?: string;
}): WriteOffPrint {
  const reasonText = opts.reasonText.trim();
  const label = reasonLabel(opts.reason, reasonText);
  const lines = opts.lines.map((l) => ({
    title: l.title,
    invNo: l.invNo,
    qty: l.qty,
    reason: lineReasonLabel(opts.reason, l.reason),
  }));
  const totalQty = lines.reduce((sum, l) => sum + (Number(l.qty) || 0), 0);
  return {
    org: ORG_REQUISITES.shortName,
    inn: ORG_REQUISITES.inn,
    number: opts.number,
    actDate: fmtDate(opts.actDate),
    reason: opts.reason,
    reasonLabel: label,
    reasonText,
    basis: opts.basis.trim(),
    note: opts.note.trim(),
    conclusion: `Комиссия осмотрела перечисленные позиции и пришла к заключению о необходимости их списания. Причина: ${label}.`,
    directorTitle: opts.directorTitle?.trim() || "Руководитель",
    directorName: opts.directorName?.trim() || "",
    commission: parseCommission(opts.commission),
    lines,
    totalPositions: lines.length,
    totalQty,
  };
}

export function parseWriteOffPrint(raw: string | null | undefined): WriteOffPrint | null {
  try {
    const v = JSON.parse(raw || "");
    if (!v || typeof v !== "object" || typeof v.number !== "string" || !Array.isArray(v.lines)) return null;
    const lines = v.lines.map((l: { title?: unknown; invNo?: unknown; qty?: unknown; reason?: unknown }) => ({
      title: String(l?.title || ""),
      invNo: String(l?.invNo || ""),
      qty: Number(l?.qty) || 0,
      reason: String(l?.reason || ""),
    }));
    return {
      org: String(v.org || ORG_REQUISITES.shortName),
      inn: String(v.inn || ORG_REQUISITES.inn),
      number: String(v.number),
      actDate: String(v.actDate || ""),
      reason: String(v.reason || ""),
      reasonLabel: String(v.reasonLabel || ""),
      reasonText: String(v.reasonText || ""),
      basis: String(v.basis || ""),
      note: String(v.note || ""),
      conclusion: String(v.conclusion || ""),
      directorTitle: String(v.directorTitle || "Руководитель"),
      directorName: String(v.directorName || ""),
      commission: parseCommission(v.commission),
      lines,
      totalPositions: Number(v.totalPositions) || lines.length,
      totalQty: Number(v.totalQty) || lines.reduce((s: number, l: WriteOffPrintLine) => s + l.qty, 0),
    };
  } catch {
    return null;
  }
}

export function inventoryVisibilityWhere(manage: boolean, userId: string, statusParam: string | null) {
  const written = manage && statusParam === "written_off";
  return {
    deletedAt: null as null,
    ...(manage ? {} : { userId }),
    status: written ? ("written_off" as const) : { not: "written_off" as const },
  };
}

export function inventoryExportWhere(includeWrittenOff: boolean) {
  return includeWrittenOff
    ? { deletedAt: null as null }
    : { deletedAt: null as null, status: { not: "written_off" as const } };
}

export function inventoryStatusLabel(status: string) {
  if (status === "written_off") return "Списано";
  if (status === "question") return "Под вопросом";
  return "В учёте";
}
