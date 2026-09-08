import { userCan, type SessionUser } from "./types";

export function needs2fa(user: { roleCode: string; permissions: string[] }) {
  if (["superadmin", "admin", "accountant"].includes(user.roleCode)) return true;
  return (
    userCan(user, "users.manage") ||
    userCan(user, "admin.settings") ||
    userCan(user, "admin.backup") ||
    userCan(user, "finance.approve") ||
    userCan(user, "finance.view_all") ||
    userCan(user, "hrdocs.review")
  );
}

export function twoFactorPending(user: SessionUser) {
  if (!needs2fa(user)) return false;
  if (!user.totpEnabled) return true;
  return !user.totpOk;
}
