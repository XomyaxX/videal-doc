import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { gateTokenValid } from "@/lib/gate";
import { markIn, markOut, requestClientIp } from "@/lib/presence";

const STALE = "Код на телевизоре уже сменился. Отсканируйте QR ещё раз.";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const kind = body?.kind === "in" || body?.kind === "out" ? body.kind : "";
  if (!kind) return NextResponse.json({ error: "Выберите приход или уход" }, { status: 400 });
  if (!(await gateTokenValid(String(body?.t || "")))) {
    return NextResponse.json({ error: STALE }, { status: 403 });
  }
  const opts = {
    userId: session.user.id,
    ip: requestClientIp(req),
    source: "gate" as const,
    trust: true,
  };
  const res = kind === "in" ? await markIn(opts) : await markOut(opts);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({
    ok: true,
    already: res.already,
    inAt: res.day.inAt,
    outAt: res.day.outAt,
    outSource: res.day.outSource,
  });
}
