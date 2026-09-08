import { parsePermissions } from "./permissions";
import type { SessionUser } from "./types";

export function rolePower(role: { code: string; permissions: string }) {
  if (role.code === "superadmin") return 1000;
  const perms = parsePermissions(role.permissions);
  let n = perms.length;
  if (role.code === "admin") n += 100;
  if (perms.includes("roles.manage")) n += 40;
  if (perms.includes("users.manage")) n += 20;
  if (perms.includes("admin.settings")) n += 20;
  return n;
}

export function canAssignRole(
  actor: SessionUser,
  role: { code: string; permissions: string },
): string | null {
  if (actor.roleCode === "superadmin") return null;
  if (role.code === "superadmin") return "Нельзя назначить супер-администратора";
  const need = parsePermissions(role.permissions);
  const have = new Set(actor.permissions);
  const extra = need.filter((p) => p && p !== "superadmin" && !have.has(p));
  if (extra.length) return "Нельзя выдать роль с правами выше своих";
  return null;
}

export function canEditUser(
  actor: SessionUser,
  target: { id: string; role: { code: string; permissions: string } },
): string | null {
  if (actor.roleCode === "superadmin") return null;
  if (target.role.code === "superadmin") return "Нельзя менять супер-администратора";
  if (target.id === actor.id) return null;
  if (rolePower(target.role) >= rolePower({ code: actor.roleCode, permissions: JSON.stringify(actor.permissions) })) {
    return "Нельзя менять сотрудника с таким же или более высоким уровнем доступа";
  }
  return null;
}
