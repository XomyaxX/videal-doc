import { NextRequest, NextResponse } from "next/server";
import { identifyUntil, registerIdentify } from "@/lib/office-lan";
import { isOfficeLanIp, requestLanIp, requestTrustedIp } from "@/lib/presence";

function officeIp(req: NextRequest) {
  return requestLanIp(req) || requestTrustedIp(req);
}

export async function GET(req: NextRequest) {
  const ip = officeIp(req);
  if (!isOfficeLanIp(ip)) {
    return NextResponse.json({ error: "Только из офисной сети" }, { status: 403 });
  }
  const until = await identifyUntil();
  if (!until) return NextResponse.json({ identify: null, code: "", until: null });
  return NextResponse.json({ identify: until.toISOString(), code: "", until: until.toISOString() });
}

export async function POST(req: NextRequest) {
  const ip = officeIp(req);
  if (!isOfficeLanIp(ip)) {
    return NextResponse.json({ error: "Только из офисной сети" }, { status: 403 });
  }
  const until = await identifyUntil();
  if (!until) return NextResponse.json({ identify: null, code: "", until: null });
  const body = await req.json().catch(() => null);
  const device = String(body?.device || req.nextUrl.searchParams.get("device") || "");
  const row = await registerIdentify({ deviceId: device, ip });
  return NextResponse.json({
    identify: until.toISOString(),
    code: row?.code || "",
    until: until.toISOString(),
  });
}
