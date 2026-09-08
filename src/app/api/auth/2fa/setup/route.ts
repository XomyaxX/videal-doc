import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { needs2fa } from "@/lib/privileges";
import { newTotpSecret, totpUrl } from "@/lib/totp";
import { storeSecret } from "@/lib/secret";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  if (!needs2fa(session.user)) return NextResponse.json({ error: "Для этой учётки код не нужен" }, { status: 400 });
  const enrolled = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { totpEnabled: true },
  });
  if (enrolled?.totpEnabled) {
    return NextResponse.json(
      { error: "Код уже включён. Сброс — в карточке сотрудника у администратора." },
      { status: 400 },
    );
  }
  const secret = newTotpSecret();
  await prisma.user.update({
    where: { id: session.user.id },
    data: { totpSecret: storeSecret(secret), totpEnabled: false },
  });
  const url = totpUrl(session.user.login, secret);
  const qr = await QRCode.toDataURL(url, { margin: 1, width: 220 });
  return NextResponse.json({ qr, secret });
}
