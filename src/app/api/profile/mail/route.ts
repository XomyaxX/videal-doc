import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mail";
import { audit } from "@/lib/audit";
import { storeSecret } from "@/lib/secret";

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const email = String(body?.email || "").trim();
  const smtpPassword = String(body?.smtpPassword || "");
  if (email && !email.includes("@")) {
    return NextResponse.json({ error: "Некорректный email" }, { status: 400 });
  }
  const current = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { smtpPassword: true },
  });
  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      email,
      ...(smtpPassword ? { smtpPassword: storeSecret(smtpPassword) } : {}),
    },
  });
  await audit({
    userId: session.user.id,
    action: "user.mail",
    entity: "user",
    entityId: session.user.id,
    details: email,
  });
  return NextResponse.json({
    ok: true,
    email,
    hasPassword: Boolean(smtpPassword || current?.smtpPassword),
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (body?.action !== "test") {
    return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
  }
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, smtpPassword: true },
  });
  if (!me?.email) return NextResponse.json({ error: "Сначала укажите email" }, { status: 400 });
  if (!me.smtpPassword) {
    return NextResponse.json({ error: "Сначала сохраните пароль приложения почты" }, { status: 400 });
  }
  const result = await sendMail({
    to: me.email,
    fromUserId: session.user.id,
    subject: "Проверка почты Видеал.Док",
    text: "Если это письмо пришло — исходящая почта сотрудника настроена. Письма из Дока будут уходить с вашего ящика.",
  });
  if (!result.ok) return NextResponse.json({ error: result.error || "Не отправилось" }, { status: 400 });
  return NextResponse.json({ ok: true, from: result.from, to: me.email });
}
