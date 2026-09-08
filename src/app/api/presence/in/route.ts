import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { markIn, parseLanList, requestClientIp } from "@/lib/presence";

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
  return NextResponse.json({ ok: true, already: res.already, inAt: res.day.inAt });
}
