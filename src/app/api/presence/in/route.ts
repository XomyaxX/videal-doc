import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { markIn, parseLanList, requestClientIp } from "@/lib/presence";
import { lanIps, pinMacToUser } from "@/lib/office-lan";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const res = await markIn({
    userId: session.user.id,
    ip: requestClientIp(req),
    extraIps: parseLanList(body?.localIps),
    source: "manual",
  });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 403 });
  const extraIps = parseLanList(body?.localIps);
  await pinMacToUser({
    userId: session.user.id,
    ips: lanIps(requestClientIp(req), extraIps),
    takeOver: true,
  }).catch(() => null);
  return NextResponse.json({ ok: true, already: res.already, inAt: res.day.inAt });
}
