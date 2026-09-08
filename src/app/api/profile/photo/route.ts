import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { saveUpload } from "@/lib/files";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Нет файла" }, { status: 400 });
  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    const saved = await saveUpload({
      buffer,
      originalName: file.name || "photo.jpg",
      declaredMime: file.type || "image/jpeg",
      userId: session.user.id,
      maxBytes: 2 * 1024 * 1024,
    });
    if (!saved.mimeType.startsWith("image/")) {
      return NextResponse.json({ error: "Нужна картинка" }, { status: 400 });
    }
    await prisma.user.update({ where: { id: session.user.id }, data: { photoFileId: saved.id } });
    await audit({ userId: session.user.id, action: "profile.photo", entity: "user", entityId: session.user.id });
    return NextResponse.json({ id: saved.id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Ошибка" }, { status: 400 });
  }
}

export async function DELETE() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  await prisma.user.update({ where: { id: session.user.id }, data: { photoFileId: "" } });
  await audit({ userId: session.user.id, action: "profile.photo.clear", entity: "user", entityId: session.user.id });
  return NextResponse.json({ ok: true });
}
