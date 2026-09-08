import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { saveUpload } from "@/lib/files";
import { audit } from "@/lib/audit";
import { archiveSigned } from "@/lib/archive";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await params;
  const rec = await prisma.documentRecipient.findUnique({
    where: { documentId_userId: { documentId: id, userId: session.user.id } },
    include: { document: true },
  });
  if (!rec) return NextResponse.json({ error: "Документ вам не назначен" }, { status: 404 });

  const settings = await prisma.appSettings.findUnique({ where: { id: "default" } });
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Загрузите подписанный скан" }, { status: 400 });
  const buffer = Buffer.from(await file.arrayBuffer());
  let saved;
  try {
    saved = await saveUpload({
      buffer,
      originalName: file.name,
      declaredMime: file.type,
      userId: session.user.id,
      maxBytes: (settings?.maxUploadMb || 32) * 1024 * 1024,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Файл" }, { status: 400 });
  }
  const signedAt = new Date();
  await prisma.documentRecipient.update({
    where: { id: rec.id },
    data: { signedFileId: saved.id, signedAt },
  });
  await audit({ userId: session.user.id, action: "document.sign", entity: "document", entityId: id });
  await archiveSigned({
    documentId: id,
    number: rec.document.number,
    title: rec.document.title,
    userId: session.user.id,
    signedAt,
    signedFileId: saved.id,
  });
  return NextResponse.json({ ok: true });
}
