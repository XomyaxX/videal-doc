import type { PermissionCode } from "./permissions";

export type SessionUser = {
  id: string;
  login: string;
  lastName: string;
  firstName: string;
  middleName: string;
  fullName: string;
  phone: string;
  email: string;
  roleId: string;
  roleCode: string;
  roleName: string;
  permissions: string[];
  mustChangePassword: boolean;
  totpEnabled: boolean;
  totpOk: boolean;
  photoFileId: string;
  departmentId: string | null;
  departmentName: string | null;
  extraDeptIds: string[];
  extraDeptNames: string[];
  positionId: string | null;
  positionName: string | null;
  status: string;
  prodScope: string;
  /** Active suspension today (Omsk), if any. */
  suspension?: { id: string; fromYmd: string; toYmd: string; reason: string; createdById: string; readOnly: boolean } | null;
};

export function userCan(user: { roleCode: string; permissions: string[] }, code: PermissionCode): boolean {
  if ((user as { suspension?: { readOnly?: boolean } | null }).suspension?.readOnly) return user.permissions.includes(code);
  return user.roleCode === "superadmin" || user.permissions.includes(code);
}
