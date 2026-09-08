export const ADVANCE_STATUS: Record<string, { label: string; tone: "draft" | "wait" | "ok" | "warn" | "bad" }> = {
  draft: { label: "Черновик", tone: "draft" },
  review: { label: "На проверке у бухгалтера", tone: "wait" },
  approve: { label: "На утверждении руководителя", tone: "wait" },
  accepted: { label: "Принят", tone: "ok" },
  rework: { label: "На доработке", tone: "warn" },
};

export const FUND_STATUS: Record<string, { label: string; tone: "draft" | "wait" | "ok" | "warn" | "bad" }> = {
  draft: { label: "Черновик", tone: "draft" },
  review: { label: "На согласовании у руководителя", tone: "wait" },
  to_pay: { label: "К выплате", tone: "wait" },
  paid: { label: "Выплачено", tone: "ok" },
  rejected: { label: "Отклонён", tone: "bad" },
  rework: { label: "На доработке", tone: "warn" },
};

export const USER_STATUS: Record<string, string> = {
  active: "Работает",
  dismissed: "Уволен",
};

export function recipientDone(r: {
  ackedAt: Date | null;
  signedAt: Date | null;
  rejectedAt: Date | null;
  approvedAt?: Date | null;
  isApprover?: boolean;
  requireAck: boolean;
  requireSignedReturn: boolean;
  requireApproval?: boolean;
}) {
  if (r.rejectedAt) return "rejected";
  const ackOk = !r.requireAck || Boolean(r.ackedAt);
  const signOk = !r.requireSignedReturn || Boolean(r.signedAt);
  const apprOk = !r.requireApproval || !r.isApprover || Boolean(r.approvedAt);
  if (ackOk && signOk && apprOk) return "done";
  return "pending";
}
