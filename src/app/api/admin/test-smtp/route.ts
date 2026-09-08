import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { userCan } from "@/lib/types";
import { sendMail } from "@/lib/mail";

export async function POST() {
  const session = await getSession();
  if (!session || !userCan(session.user, "admin.settings")) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const to = session.user.email?.trim();
  if (!to) {
    return NextResponse.json({ error: "В вашей карточке нет email" }, { status: 400 });
  }
  const sent = await sendMail({
    to,
    subject: "Тест SMTP — Видеал.Док",
    text: "Если это письмо дошло, исходящая почта студии работает.",
  });
  if (!sent.ok) return NextResponse.json({ error: sent.error || "Не отправилось" }, { status: 400 });
  return NextResponse.json({ ok: true, to, from: sent.from });
}
