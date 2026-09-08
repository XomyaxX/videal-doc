import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { totpOk } from "@/lib/totp";
import { revealSecret } from "@/lib/secret";
import { needs2fa } from "@/lib/privileges";
import { audit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  if (!needs2fa(session.user)) return NextResponse.json({ error: "Для этой учётки код не нужен" }, { status: 400 });
  const body = await req.json().catch(() => null);
  const row = await prisma.user.findUnique({ where: { id: session.user.id }, select: { totpSecret: true } });
  const secret = revealSecret(row?.totpSecret || "");
  if (!totpOk(secret, String(body?.code || ""))) {
    return NextResponse.json({ error: "Неверный код" }, { status: 400 });
  }
  await prisma.user.update({ where: { id: session.user.id }, data: { totpEnabled: true } });
  await prisma.session.updateMany({ where: { token: session.token }, data: { totpOk: true } });
  await audit({ userId: session.user.id, action: "2fa.enable", entity: "user", entityId: session.user.id });
  return NextResponse.json({ ok: true });
}
