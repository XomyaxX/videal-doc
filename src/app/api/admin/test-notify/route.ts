import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { userCan } from "@/lib/types";
import { prisma } from "@/lib/prisma";
import { sendWebPushToUser } from "@/lib/push";
import { sendMailToUser } from "@/lib/mail";
import { fullName } from "@/lib/names";
import { parseUrgency } from "@/lib/notify-urgency";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !userCan(session.user, "admin.settings")) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const userId = String(body?.userId || session.user.id);
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { id: true, login: true, lastName: true, firstName: true, middleName: true, email: true },
  });
  if (!user) return NextResponse.json({ error: "Сотрудник не найден" }, { status: 404 });

  const urgency = parseUrgency(body?.urgency);
  const title = urgency === "urgent" ? "Срочное тестовое уведомление" : "Тестовое уведомление";
  const text = `Проверка доставки для ${fullName(user)}. Колокольчик в Доке и пуш на телефон, если приложение разрешило уведомления.`;
  const row = await prisma.notification.create({
    data: { userId: user.id, title, body: text, link: "/notifications", urgency },
  });
  const push = await sendWebPushToUser(user.id, {
    title,
    body: text,
    link: "/notifications",
    urgency,
    id: row.id,
  });
  let mail = "нет email в карточке";
  if (user.email) {
    const sent = await sendMailToUser({
      userId: user.id,
      subject: "Тестовое уведомление — Видеал.Док",
      text,
    });
    mail = sent.ok ? `письмо отправлено на ${user.email}` : `письмо: ${sent.error}`;
  }

  return NextResponse.json({
    ok: true,
    who: `${fullName(user)} (${user.login})`,
    inapp: true,
    push: push.none
      ? "нет подписки на этом человеке"
      : `доставлено ${push.sent}, ошибок ${push.failed}${push.error ? ` (${push.error})` : ""}`,
    mail,
  });
}
