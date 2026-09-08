import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { userCan } from "@/lib/types";
import { prisma } from "@/lib/prisma";
import { nextNumber } from "@/lib/sequence";
import { rubToKopecks } from "@/lib/money";
import { notify } from "@/lib/notify";
import { audit } from "@/lib/audit";
import { saveUpload } from "@/lib/files";
import { officeYmd } from "@/lib/dates";
import { isFundApprover } from "@/lib/leaders";
import { archiveFund } from "@/lib/archive";
import { mailSettings, sendMailToUser, siteUrl } from "@/lib/mail";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const viewAll = userCan(session.user, "finance.view_all") || userCan(session.user, "finance.approve");
  const rows = await prisma.fundRequest.findMany({
    where: {
      deletedAt: null,
      ...(viewAll
        ? {}
        : {
            OR: [{ authorId: session.user.id }, { managerId: session.user.id }],
          }),
    },
    include: {
      author: { select: { id: true, lastName: true, firstName: true, middleName: true } },
      manager: { select: { id: true, lastName: true, firstName: true, middleName: true } },
      files: true,
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ rows });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !userCan(session.user, "finance.create")) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const settings = await prisma.appSettings.findUnique({ where: { id: "default" } });
  const form = await req.formData();
  const purpose = String(form.get("purpose") || "").trim();
  const amount = rubToKopecks(String(form.get("amount") || "0"));
  if (!purpose) return NextResponse.json({ error: "Укажите, на что нужны деньги" }, { status: 400 });
  if (amount <= 0) return NextResponse.json({ error: "Укажите сумму" }, { status: 400 });
  const neededRaw = String(form.get("neededAt") || "").trim();
  if (neededRaw && neededRaw.slice(0, 10) < officeYmd()) {
    return NextResponse.json({ error: "Дата не может быть в прошлом" }, { status: 400 });
  }
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { manager: { include: { position: true, role: true } } },
  });
  let managerId = String(form.get("managerId") || "") || null;
  if (!managerId && me?.manager && isFundApprover(me.manager)) managerId = me.manager.id;
  if (managerId) {
    const mgr = await prisma.user.findFirst({
      where: { id: managerId, deletedAt: null, status: "active" },
      include: { position: true, role: true },
    });
    if (!mgr || !isFundApprover(mgr)) {
      return NextResponse.json(
        { error: "Выберите сотрудника с должностью или ролью «Руководитель»" },
        { status: 400 },
      );
    }
  }
  const number = await nextNumber("zs", "ЗС");
  const created = await prisma.fundRequest.create({
    data: {
      number,
      authorId: session.user.id,
      amount,
      purpose,
      details: String(form.get("details") || ""),
      neededAt: form.get("neededAt") ? new Date(String(form.get("neededAt"))) : null,
      payee: String(form.get("payee") || ""),
      managerId,
      status: "draft",
    },
  });
  const files = form.getAll("files");
  for (const file of files) {
    if (!(file instanceof File) || file.size === 0) continue;
    const buf = Buffer.from(await file.arrayBuffer());
    const saved = await saveUpload({
      buffer: buf,
      originalName: file.name,
      declaredMime: file.type,
      userId: session.user.id,
      maxBytes: (settings?.maxUploadMb || 32) * 1024 * 1024,
    });
    await prisma.fundRequestFile.create({ data: { requestId: created.id, fileId: saved.id } });
  }
  const submit = form.get("submit") === "true" || form.get("submit") === "on";
  if (submit) {
    if (!managerId) return NextResponse.json({ error: "Укажите руководителя для согласования" }, { status: 400 });
    await prisma.fundRequest.update({ where: { id: created.id }, data: { status: "review" } });
    await notify({
      userId: managerId,
      title: "Запрос средств на согласовании",
      body: `${created.number} · ${purpose}`,
      link: `/funds/${created.id}`,
      urgency: "normal",
    });
    await archiveFund(created.id);
    void (async () => {
      const s = await mailSettings();
      if (s?.mailAutoSend === false) return;
      await sendMailToUser({
        userId: managerId,
        fromUserId: session.user.id,
        subject: `Запрос средств ${created.number}`,
        text: `${created.number} · ${purpose}\n${siteUrl(`/funds/${created.id}`)}`,
      });
    })().catch((e) => console.error("mail.fund", e));
  }
  await audit({ userId: session.user.id, action: "fund.create", entity: "fund", entityId: created.id });
  return NextResponse.json({ id: created.id });
}
