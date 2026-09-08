import { userCan, type SessionUser } from "./types";

export const ARCHIVE_KIND_LABEL: Record<string, string> = {
  circular: "Рассылка",
  ack: "Ознакомление",
  signed: "Подписанный скан",
  receipt: "Чек / расход",
  advance: "Авансовый отчёт",
  fund: "Запрос средств",
  purchase: "Закупка",
  hr: "Заявление",
  hr_scan: "Подписанное заявление",
};

export const ARCHIVE_KIND_TONE: Record<string, string> = {
  circular: "wait",
  ack: "ok",
  signed: "ok",
  receipt: "wait",
  advance: "wait",
  fund: "wait",
  purchase: "draft",
  hr: "wait",
  hr_scan: "ok",
};

export function canViewArchive(
  viewer: SessionUser,
  target: { id: string; departmentId: string | null; managerId?: string | null },
): boolean {
  if (viewer.id === target.id) return true;
  if (!userCan(viewer, "archive.view_all")) return false;
  if (["admin", "superadmin", "aho", "accountant"].includes(viewer.roleCode)) return true;
  if (target.managerId && target.managerId === viewer.id) return true;
  return false;
}
