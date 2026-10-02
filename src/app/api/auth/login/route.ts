import { NextRequest, NextResponse } from "next/server";
import { DEVICE_COOKIE, loginWithPassword, SESSION_COOKIE } from "@/lib/auth";
import { audit, isRemoteRole } from "@/lib/audit";
import { deviceCookieOpts, sessionCookieOpts } from "@/lib/cookie";
import { loginBlocked, loginFailed, loginOk } from "@/lib/login-guard";
import { randomToken } from "@/lib/password";
import { fullName } from "@/lib/names";
import { needs2fa } from "@/lib/privileges";
import { requestTrustedIp } from "@/lib/presence";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const login = String(body?.login || "");
  const password = String(body?.password || "");
  const ip = requestTrustedIp(req) || "unknown";
  const ua = req.headers.get("user-agent") || "";
  const blocked = loginBlocked(ip, login);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 429 });

  let device = req.cookies.get(DEVICE_COOKIE)?.value || "";
  if (!device || device.length < 16) device = randomToken(24);
  const remember = body?.remember !== false;

  const result = await loginWithPassword(login, password, ip, ua, device, remember);
  if ("error" in result) {
    loginFailed(ip, login);
    return NextResponse.json({ error: result.error }, { status: 401 });
  }
  loginOk(ip, login);
  await audit({
    userId: result.user.id,
    action: "login",
    entity: "session",
    ip,
    details: isRemoteRole(result.user.roleCode) ? ua.slice(0, 400) : "",
  });
  const privileged = needs2fa(result.user);
  const res = NextResponse.json({
    account: {
      userId: result.user.id,
      login: result.user.login,
      fullName: fullName(result.user),
      roleName: result.user.roleName,
    },
    mustChangePassword: result.user.mustChangePassword,
    need2faSetup: privileged && !result.user.totpEnabled,
    need2fa: privileged && result.user.totpEnabled && !result.user.totpOk,
  });
  res.cookies.set(SESSION_COOKIE, result.token, sessionCookieOpts(req, result.days));
  res.cookies.set(DEVICE_COOKIE, device, deviceCookieOpts(req));
  return res;
}
