import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { saveProdFile } from "@/lib/prod-server";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await ctx.params;
  const settings = await prisma.appSettings.findUnique({ where: { id: "default" } });
  const maxBytes = (settings?.maxUploadMb || 250) * 1024 * 1024;
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Нет файла" }, { status: 400 });
  const kind = String(form.get("kind") || "playblast");
  try {
    const rec = await saveProdFile({
      user: session.user,
      taskId: id,
      buffer: Buffer.from(await file.arrayBuffer()),
      originalName: file.name,
      mime: file.type,
      maxBytes,
      kind,
    });
    return NextResponse.json({
      id: rec.id,
      name: rec.originalName,
      unc: rec.uncPath,
      size: rec.size,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Ошибка" }, { status: 400 });
  }
}
