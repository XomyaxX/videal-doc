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
  positionId: string | null;
  positionName: string | null;
  status: string;
  prodScope: string;
};

export function userCan(user: { roleCode: string; permissions: string[] }, code: PermissionCode): boolean {
  return user.roleCode === "superadmin" || user.permissions.includes(code);
}
