import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { parseLanList, requestClientIp } from "@/lib/presence";
import { lanIps, pinMacToUser } from "@/lib/office-lan";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const ips = lanIps(requestClientIp(req), parseLanList(body?.localIps));
  const res = await pinMacToUser({ userId: session.user.id, ips, takeOver: true });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true, mac: res.mac, ip: res.ip });
}
