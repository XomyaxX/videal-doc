import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { totpOk } from "@/lib/totp";
import { revealSecret } from "@/lib/secret";
import { rateLimit } from "@/lib/login-guard";
import { audit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!rateLimit(`2fa:${ip}`, 20, 15 * 60 * 1000)) {
    return NextResponse.json({ error: "Слишком много попыток" }, { status: 429 });
  }
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const row = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { totpSecret: true, totpEnabled: true },
  });
  if (!row?.totpEnabled) return NextResponse.json({ error: "Сначала привяжите приложение" }, { status: 400 });
  if (!totpOk(revealSecret(row.totpSecret), String(body?.code || ""))) {
    return NextResponse.json({ error: "Неверный код" }, { status: 400 });
  }
  await prisma.session.updateMany({ where: { token: session.token }, data: { totpOk: true } });
  await audit({ userId: session.user.id, action: "2fa.ok", entity: "session" });
  return NextResponse.json({ ok: true });
}
