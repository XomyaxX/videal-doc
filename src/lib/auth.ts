import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { parsePermissions, type PermissionCode } from "./permissions";
import { fullName } from "./names";
import { hashPassword, MIN_PASSWORD_LEN, randomToken, verifyPassword } from "./password";
import type { SessionUser } from "./types";
import { userCan } from "./types";
import { needs2fa, twoFactorPending } from "./privileges";

export type { SessionUser } from "./types";
export { userCan as can } from "./types";

export const SESSION_COOKIE = "vd_session";
export const DEVICE_COOKIE = "vd_device";

function toUser(row: {
  id: string;
  login: string;
  lastName: string;
  firstName: string;
  middleName: string;
  phone: string;
  email: string;
  mustChangePassword: boolean;
  totpEnabled?: boolean;
  photoFileId: string;
  departmentId: string | null;
  positionId: string | null;
  status: string;
  prodScope: string;
  role: { id: string; code: string; name: string; permissions: string };
  department: { name: string } | null;
  position: { name: string } | null;
}): SessionUser {
  return {
    id: row.id,
    login: row.login,
    lastName: row.lastName,
    firstName: row.firstName,
    middleName: row.middleName,
    fullName: fullName(row),
    phone: row.phone,
    email: row.email,
    roleId: row.role.id,
    roleCode: row.role.code,
    roleName: row.role.name,
    permissions: parsePermissions(row.role.permissions),
    mustChangePassword: row.mustChangePassword,
    totpEnabled: Boolean(row.totpEnabled),
    totpOk: true,
    photoFileId: row.photoFileId,
    departmentId: row.departmentId,
    departmentName: row.department?.name ?? null,
    positionId: row.positionId,
    positionName: row.position?.name ?? null,
    status: row.status,
    prodScope: row.prodScope || "",
  };
}

export async function getSession(): Promise<{ token: string; user: SessionUser } | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { token },
    include: {
      user: {
        include: { role: true, department: true, position: true },
      },
    },
  });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  if (session.user.deletedAt || session.user.status !== "active") return null;
  const user = toUser(session.user);
  user.totpOk = session.totpOk;
  const path = (await headers()).get("x-vd-path") || "";
  const gateApi =
    (session.user.mustChangePassword || twoFactorPending(user)) && path.startsWith("/api/");
  if (gateApi) {
    const ok =
      path.startsWith("/api/auth/password") ||
      path.startsWith("/api/auth/logout") ||
      path.startsWith("/api/auth/switch") ||
      path.startsWith("/api/auth/accounts") ||
      path.startsWith("/api/auth/2fa");
    if (!ok) return null;
  }
  if (Date.now() - session.lastSeenAt.getTime() > 5 * 60 * 1000) {
    await prisma.session.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    });
  }
  return { token: session.token, user };
}

export async function requireUser(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.user.mustChangePassword) redirect("/change-password");
  if (needs2fa(session.user) && !session.user.totpEnabled) redirect("/setup-2fa");
  if (needs2fa(session.user) && session.user.totpEnabled && !session.user.totpOk) redirect("/login/2fa");
  return session.user;
}

export async function requirePermission(code: PermissionCode): Promise<SessionUser> {
  const user = await requireUser();
  if (!userCan(user, code)) {
    redirect("/forbidden");
  }
  return user;
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "";
}

export async function createSession(
  userId: string,
  ip: string,
  userAgent: string,
  deviceId = "",
  totpOk = true,
) {
  const settings = await prisma.appSettings.findUnique({ where: { id: "default" } });
  const days = settings?.sessionDays || 30;
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  await prisma.session.create({
    data: { token, userId, ip, userAgent: userAgent.slice(0, 300), expiresAt, deviceId, totpOk },
  });
  return token;
}

export async function loginWithPassword(
  login: string,
  password: string,
  ip: string,
  userAgent: string,
  deviceId = "",
) {
  const user = await prisma.user.findFirst({
    where: { login: login.trim(), deletedAt: null },
    include: { role: true, department: true, position: true },
  });
  if (!user || user.status !== "active") return { error: "Неверный логин или пароль" as const };
  if (!verifyPassword(password, user.passwordHash)) return { error: "Неверный логин или пароль" as const };
  const mapped = toUser(user);
  const token = await createSession(user.id, ip, userAgent, deviceId, !needs2fa(mapped));
  mapped.totpOk = !needs2fa(mapped);
  return { token, user: mapped };
}

export async function changePassword(userId: string, current: string, next: string, keepToken?: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { error: "Пользователь не найден" as const };
  if (!verifyPassword(current, user.passwordHash)) return { error: "Текущий пароль неверный" as const };
  if (next.trim().length < MIN_PASSWORD_LEN) {
    return { error: `Новый пароль — минимум ${MIN_PASSWORD_LEN} символов` as const };
  }
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: hashPassword(next.trim()), mustChangePassword: false },
  });
  await prisma.session.deleteMany({
    where: keepToken ? { userId, token: { not: keepToken } } : { userId },
  });
  return { ok: true as const };
}

export type SavedAccount = {
  token: string;
  userId: string;
  login: string;
  fullName: string;
  roleName: string;
};

export async function accountFromToken(token: string): Promise<SavedAccount | null> {
  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: { include: { role: true } } },
  });
  if (!session || session.expiresAt < new Date()) return null;
  if (session.user.deletedAt || session.user.status !== "active") return null;
  return {
    token,
    userId: session.user.id,
    login: session.user.login,
    fullName: fullName(session.user),
    roleName: session.user.role.name,
  };
}
