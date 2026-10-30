import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notify";
import { archiveHrLetter, archiveHrScan } from "@/lib/archive";
import { notifyHrSubmitted } from "@/lib/hr-submit";
import { USER_SAFE_ORG_SELECT } from "@/lib/user-public";

async function load(id: string) {
  return prisma.hrRequest.findUnique({
    where: { id },
    include: {
      author: { select: USER_SAFE_ORG_SELECT },
      manager: { select: USER_SAFE_ORG_SELECT },
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

  if (action === "submit" && mine && ["draft", "signed", "rework"].includes(row.status)) {
    await prisma.hrRequest.update({ where: { id }, data: { status: "review" } });
    await archiveHrLetter(id, true);
    if (row.signedFileId) await archiveHrScan(id);
    await notifyHrSubmitted({ ...row, id }, session.user.id);
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
      title:
        next === "accepted"
          ? "Заявление согласовано"
          : next === "rejected"
            ? "Заявление отклонено"
            : "Заявление вернули",
      body:
        next === "accepted"
          ? `${row.number}: распечатайте, подпишите и передайте руководителю`
          : String(body.note || row.number),
      link: `/statements/${id}`,
      urgency: next === "rejected" || next === "rework" ? "urgent" : "normal",
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
}
