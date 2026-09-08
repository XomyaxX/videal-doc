import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { parseLanList, presenceSnapshot, requestClientIp } from "@/lib/presence";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const extra = parseLanList(req.nextUrl.searchParams.get("lan"));
  const snap = await presenceSnapshot(session.user.id, requestClientIp(req), extra);
  return NextResponse.json({ ...snap, ip: requestClientIp(req) });
}
