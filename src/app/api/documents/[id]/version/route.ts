import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { saveUpload } from "@/lib/files";
import { audit } from "@/lib/audit";
import { notifyMany } from "@/lib/notify";
import { userCan } from "@/lib/types";
import { ensureDocumentRevisions } from "@/lib/document-revisions";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await params;
  const doc = await prisma.document.findFirst({
    where: { id, deletedAt: null },
    include: { recipients: { select: { userId: true } } },
  });
  if (!doc) return NextResponse.json({ error: "Нет документа" }, { status: 404 });
  const canEdit = doc.authorId === session.user.id || userCan(session.user, "docs.manage");
  if (!canEdit) return NextResponse.json({ error: "Нет права менять файл" }, { status: 403 });

  const form = await req.formData();
  const file = form.get("file");
  const note = String(form.get("note") || "").trim();
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Приложите новый файл" }, { status: 400 });
  }
  const settings = await prisma.appSettings.findUnique({ where: { id: "default" } });
  const maxBytes = (settings?.maxUploadMb || 32) * 1024 * 1024;
  let saved;
  try {
    saved = await saveUpload({
      buffer: Buffer.from(await file.arrayBuffer()),
      originalName: file.name,
      declaredMime: file.type,
      userId: session.user.id,
      maxBytes,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Файл" }, { status: 400 });
  }

  await ensureDocumentRevisions(doc);
  const next = doc.version + 1;
  await prisma.document.update({
    where: { id: doc.id },
    data: { originalFileId: saved.id, version: next },
  });
  await prisma.documentRevision.create({
    data: {
      documentId: doc.id,
      version: next,
      fileId: saved.id,
      note: note || `Версия ${next}`,
      authorId: session.user.id,
    },
  });
  await prisma.documentRecipient.updateMany({
    where: { documentId: doc.id },
    data: {
      viewedAt: null,
      ackedAt: null,
      signedAt: null,
      signedFileId: "",
      approvedAt: null,
      rejectedAt: null,
      rejectReason: "",
    },
  });
  await notifyMany(
    doc.recipients.map((r) => r.userId),
    {
      title: `Обновлён документ: версия ${next}`,
      body: `${doc.title} (${doc.number})`,
      link: `/documents/${doc.id}`,
      urgency: "urgent",
    },
  );
  await audit({
    userId: session.user.id,
    action: "document.version",
    entity: "document",
    entityId: doc.id,
    details: `v${next} ${saved.originalName}`,
  });
  return NextResponse.json({ ok: true, version: next });
}
