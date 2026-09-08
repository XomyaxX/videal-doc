import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { userCan } from "@/lib/types";
import { prisma } from "@/lib/prisma";
import { saveUpload } from "@/lib/files";
import { nextNumber } from "@/lib/sequence";
import { notifyMany } from "@/lib/notify";
import { documentUrgency } from "@/lib/notify-urgency";
import { audit } from "@/lib/audit";
import { archiveCircular } from "@/lib/archive";
import { mailSettings, sendMailToUser, siteUrl } from "@/lib/mail";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  if (!userCan(session.user, "docs.send")) return NextResponse.json({ error: "Нет права рассылать" }, { status: 403 });

  const settings = await prisma.appSettings.findUnique({ where: { id: "default" } });
  const maxBytes = (settings?.maxUploadMb || 32) * 1024 * 1024;
  const form = await req.formData();
  const title = String(form.get("title") || "").trim();
  const comment = String(form.get("comment") || "").trim();
  const requireAck = form.get("requireAck") === "on" || form.get("requireAck") === "true";
  const requireSignedReturn = form.get("requireSignedReturn") === "on" || form.get("requireSignedReturn") === "true";
  const requireApproval = form.get("requireApproval") === "on" || form.get("requireApproval") === "true";
  const approverIds = form.getAll("approverIds").map(String).filter(Boolean);
  const remindDaily = form.get("remindDaily") === "on" || form.get("remindDaily") === "true";
  const dueRaw = String(form.get("dueAt") || "");
  const includeMe = form.get("includeMe") === "on" || form.get("includeMe") === "true";
  const all = form.get("all") === "on" || form.get("all") === "true";
  const departmentId = String(form.get("departmentId") || "");
  const recipientIds = form.getAll("recipientIds").map(String).filter(Boolean);
  const file = form.get("file");

  if (!title) return NextResponse.json({ error: "Укажите название" }, { status: 400 });
  if (!requireAck && !requireSignedReturn && !requireApproval) {
    return NextResponse.json({ error: "Выберите: ознакомиться, вернуть подписанным и/или согласовать" }, { status: 400 });
  }
  if (!(file instanceof File)) return NextResponse.json({ error: "Приложите файл" }, { status: 400 });

  let users = await prisma.user.findMany({
    where: { deletedAt: null, status: "active" },
    select: { id: true },
  });
  if (!all) {
    if (departmentId) {
      users = await prisma.user.findMany({
        where: { deletedAt: null, status: "active", departmentId },
        select: { id: true },
      });
    } else {
      users = users.filter((u) => recipientIds.includes(u.id));
    }
  }
  let ids = users.map((u) => u.id);
  if (includeMe && !ids.includes(session.user.id)) ids.push(session.user.id);
  if (requireApproval) {
    if (approverIds.length === 0) return NextResponse.json({ error: "Выберите, кто согласовывает" }, { status: 400 });
    ids.push(...approverIds);
  }
  ids = Array.from(new Set(ids));
  if (ids.length === 0) return NextResponse.json({ error: "Выберите получателей" }, { status: 400 });
  const approverSet = new Set(requireApproval ? approverIds : []);

  const buffer = Buffer.from(await file.arrayBuffer());
  let saved;
  try {
    saved = await saveUpload({
      buffer,
      originalName: file.name,
      declaredMime: file.type,
      userId: session.user.id,
      maxBytes,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Файл" }, { status: 400 });
  }

  const number = await nextNumber("doc", "ВД");
  const doc = await prisma.document.create({
    data: {
      number,
      title,
      comment,
      requireAck,
      requireSignedReturn,
      requireApproval,
      remindDaily,
      dueAt: dueRaw ? new Date(dueRaw) : null,
      authorId: session.user.id,
      originalFileId: saved.id,
      recipients: {
        create: ids.map((userId) => ({
          userId,
          isApprover: approverSet.has(userId),
        })),
      },
    },
  });
  await prisma.documentRevision.create({
    data: {
      documentId: doc.id,
      version: 1,
      fileId: saved.id,
      note: "Первая версия",
      authorId: session.user.id,
    },
  });

  const kinds = [
    requireAck ? "ознакомиться" : "",
    requireSignedReturn ? "подписать" : "",
    requireApproval ? "согласовать" : "",
  ].filter(Boolean);
  await notifyMany(ids, {
    title: `Новый документ: ${kinds.join(", ")}`,
    body: `${title} (${number})`,
    link: `/documents/${doc.id}`,
    urgency: documentUrgency({
      requireAck,
      requireSignedReturn,
      requireApproval,
      dueAt: dueRaw ? new Date(dueRaw) : null,
    }),
  });
  await audit({
    userId: session.user.id,
    action: "document.send",
    entity: "document",
    entityId: doc.id,
    details: `${title} → ${ids.length} чел.`,
  });

  await archiveCircular({
    documentId: doc.id,
    number,
    title,
    occurredAt: doc.createdAt,
    originalFileId: saved.id,
    userIds: [session.user.id, ...ids],
  });

  void (async () => {
    const s = await mailSettings();
    if (s?.mailAutoSend === false) return;
    const text = `Вам направлен документ «${title}» (${number}).\nОткройте в Видеал.Док: ${siteUrl(`/documents/${doc.id}`)}`;
    for (const uid of ids) {
      const mailed = await sendMailToUser({
        userId: uid,
        fromUserId: session.user.id,
        subject: `Документ ${number}: ${title}`,
        text,
        attachments: [
          { filename: saved.originalName, content: buffer, contentType: saved.mimeType },
        ],
      });
      if (mailed.ok) {
        await prisma.personDocument.updateMany({
          where: { userId: uid, kind: "circular", source: "document", sourceId: doc.id },
          data: { mailedAt: new Date() },
        });
      }
    }
  })().catch((e) => console.error("mail.circular", e));

  return NextResponse.json({ id: doc.id });
}
