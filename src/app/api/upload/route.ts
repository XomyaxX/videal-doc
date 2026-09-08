import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { saveUpload } from "@/lib/files";
import { prisma } from "@/lib/prisma";
import { userCan } from "@/lib/types";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const allowed =
    userCan(session.user, "docs.send") ||
    userCan(session.user, "finance.create") ||
    userCan(session.user, "hrdocs.create") ||
    userCan(session.user, "scan.use") ||
    userCan(session.user, "prod.work");
  if (!allowed) return NextResponse.json({ error: "Нет права загружать" }, { status: 403 });
  const settings = await prisma.appSettings.findUnique({ where: { id: "default" } });
  const maxBytes = (settings?.maxUploadMb || 32) * 1024 * 1024;
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Нет файла" }, { status: 400 });
  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    const saved = await saveUpload({
      buffer,
      originalName: file.name,
      declaredMime: file.type,
      userId: session.user.id,
      maxBytes,
    });
    return NextResponse.json({ id: saved.id, name: saved.originalName, mime: saved.mimeType, size: saved.size });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Ошибка загрузки" }, { status: 400 });
  }
}
