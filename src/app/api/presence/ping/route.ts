import { NextRequest, NextResponse } from "next/server";
import { DEVICE_COOKIE, getSession } from "@/lib/auth";
import { parseLanList, presencePing, requestClientIp } from "@/lib/presence";
import { lanIps, pinMacToUser } from "@/lib/office-lan";
import { prisma } from "@/lib/prisma";
import { randomToken } from "@/lib/password";
import { deviceCookieOpts } from "@/lib/cookie";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const ip = requestClientIp(req);
  const extraIps = parseLanList(body?.localIps);
  const res = await presencePing({ userId: session.user.id, ip, extraIps });
  let device = req.cookies.get(DEVICE_COOKIE)?.value || "";
  if (!device || device.length < 16) device = randomToken(24);
  const candidates = lanIps(ip, extraIps);
  const lanIp = candidates[0] || "";
  if (lanIp) {
    await prisma.session.updateMany({ where: { token: session.token }, data: { lastLanIp: lanIp } });
    await pinMacToUser({ userId: session.user.id, ips: candidates }).catch(() => null);
  }
  const out = NextResponse.json({
    ...res,
    ip,
    lanIp,
  });
  out.cookies.set(DEVICE_COOKIE, device, deviceCookieOpts(req));
  return out;
}
