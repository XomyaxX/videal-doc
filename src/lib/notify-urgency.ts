import { officeYmd } from "./dates";

export const URGENCIES = ["info", "normal", "urgent"] as const;
export type Urgency = (typeof URGENCIES)[number];

export function parseUrgency(raw: unknown): Urgency {
  const v = String(raw || "");
  if (v === "info" || v === "urgent") return v;
  return "normal";
}

export function documentUrgency(doc: {
  requireSignedReturn?: boolean;
  requireApproval?: boolean;
  requireAck?: boolean;
  dueAt?: Date | null;
}): Urgency {
  if (doc.requireSignedReturn || doc.requireApproval) return "urgent";
  if (doc.requireAck && doc.dueAt) {
    if (officeYmd(doc.dueAt) <= officeYmd()) return "urgent";
  }
  return "normal";
}
