import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canViewArchive } from "@/lib/archive-access";
import { mailStoredFileToUser, sendMailToUser, siteUrl, resolveSmtp } from "@/lib/mail";
import { ARCHIVE_KIND_LABEL } from "@/lib/archive-access";

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await ctx.params;
  const row = await prisma.personDocument.findUnique({
    where: { id },
    include: { user: { select: { id: true, email: true, departmentId: true, managerId: true } } },
  });
  if (!row || !canViewArchive(session.user, row.user)) {
    return NextResponse.json({ error: "Нет" }, { status: 404 });
  }
  const acc = await resolveSmtp(session.user.id);
  if (!acc) {
    return NextResponse.json(
      { error: "Подключите почту в профиле (пароль приложения) или SMTP студии в настройках" },
      { status: 400 },
    );
  }
  if (!row.user.email) {
    return NextResponse.json({ error: "У сотрудника не указан email" }, { status: 400 });
  }
  const kind = ARCHIVE_KIND_LABEL[row.kind] || row.kind;
  const text = `${kind}: ${row.title}\nДата: ${row.occurredAt.toISOString()}\n${row.link ? siteUrl(row.link) : siteUrl("/archive")}`;
  const subject = `${kind}: ${row.title}`;
  const result = row.fileId
    ? await mailStoredFileToUser({
        userId: row.userId,
        fileId: row.fileId,
        subject,
        text,
        personDocumentId: row.id,
        fromUserId: session.user.id,
      })
    : await sendMailToUser({
        userId: row.userId,
        subject,
        text,
        personDocumentId: row.id,
        fromUserId: session.user.id,
      });
  if (!result.ok) return NextResponse.json({ error: result.error || "Не отправилось" }, { status: 400 });
  return NextResponse.json({ ok: true, to: row.user.email });
}
