import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { parseLanList, presencePing, requestClientIp } from "@/lib/presence";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const ip = requestClientIp(req);
  const extraIps = parseLanList(body?.localIps);
  const res = await presencePing({ userId: session.user.id, ip, extraIps });
  return NextResponse.json({ ...res, ip });
}
