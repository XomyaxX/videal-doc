import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notify";
import { archiveHrLetter, archiveHrScan } from "@/lib/archive";
import { mailSettings, sendMailToUser, siteUrl } from "@/lib/mail";

async function load(id: string) {
  return prisma.hrRequest.findUnique({
    where: { id },
    include: {
      author: { include: { position: true, department: true } },
      manager: { include: { position: true, department: true } },
    },
  });
}

function canSee(
  user: { id: string; roleCode: string; permissions: string[] },
  row: { authorId: string; managerId: string },
) {
  return row.authorId === user.id || row.managerId === user.id;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await ctx.params;
  const row = await load(id);
  if (!row || !canSee(session.user, row)) return NextResponse.json({ error: "Нет" }, { status: 404 });
  return NextResponse.json({ row });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await ctx.params;
  const row = await load(id);
  if (!row || !canSee(session.user, row)) return NextResponse.json({ error: "Нет" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "");
  const mine = row.authorId === session.user.id;
  const theirs = row.managerId === session.user.id;

  if (action === "save" && mine && ["draft", "rework"].includes(row.status)) {
    await prisma.hrRequest.update({
      where: { id },
      data: {
        managerId: body.managerId || row.managerId,
        payloadJson: body.payload ? JSON.stringify(body.payload) : row.payloadJson,
      },
    });
    await archiveHrLetter(id, true);
    return NextResponse.json({ ok: true });
  }

  if (action === "attach" && mine && ["draft", "signed", "rework"].includes(row.status)) {
    const fileId = String(body.fileId || "");
    if (!fileId) return NextResponse.json({ error: "Прикрепите скан" }, { status: 400 });
    await prisma.hrRequest.update({
      where: { id },
      data: { signedFileId: fileId, status: "signed" },
    });
    await archiveHrScan(id);
    return NextResponse.json({ ok: true });
  }

  if (action === "submit" && mine && row.status === "signed") {
    if (!row.signedFileId) return NextResponse.json({ error: "Сначала приложите подписанный скан" }, { status: 400 });
    await prisma.hrRequest.update({ where: { id }, data: { status: "review" } });
    await archiveHrLetter(id, true);
    await archiveHrScan(id);
    await notify({
      userId: row.managerId,
      title: "Заявление на рассмотрении",
      body: `${row.number} · ${row.title}`,
      link: `/statements/${id}`,
      urgency: "normal",
    });
    void (async () => {
      const s = await mailSettings();
      if (s?.mailAutoSend === false) return;
      const text = `Заявление ${row.number} «${row.title}» отправлено на рассмотрение.\n${siteUrl(`/statements/${id}`)}`;
      await sendMailToUser({
        userId: row.managerId,
        fromUserId: session.user.id,
        subject: `Заявление ${row.number}: ${row.title}`,
        text,
      });
      await sendMailToUser({
        userId: row.authorId,
        fromUserId: session.user.id,
        subject: `Заявление ${row.number} отправлено`,
        text,
      });
    })().catch((e) => console.error("mail.hr", e));
    return NextResponse.json({ ok: true });
  }

  if ((action === "accept" || action === "reject" || action === "rework") && theirs && row.status === "review") {
    const next = action === "accept" ? "accepted" : action === "reject" ? "rejected" : "rework";
    await prisma.hrRequest.update({
      where: { id },
      data: { status: next, managerNote: String(body.note || "") },
    });
    await notify({
      userId: row.authorId,
      title: next === "accepted" ? "Заявление принято" : next === "rejected" ? "Заявление отклонено" : "Заявление вернули",
      body: String(body.note || row.number),
      link: `/statements/${id}`,
      urgency: next === "rejected" || next === "rework" ? "urgent" : "normal",
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
}
