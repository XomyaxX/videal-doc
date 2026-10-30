import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  canPurgeTraining,
  purgeTrainingFile,
  restoreTrainingFile,
  serveTrainingRange,
  trainingFileAbs,
  trashTrainingFile,
} from "@/lib/training";
import { audit } from "@/lib/audit";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string; fileId: string }> }) {
  const session = await getSession();
  if (!session) return new NextResponse("Нужно войти", { status: 401 });
  const { id, fileId } = await ctx.params;
  const file = await prisma.trainingFile.findFirst({
    where: { id: fileId, itemId: id },
    include: { item: true },
  });
  if (!file) return new NextResponse("Нет", { status: 404 });
  if (file.deletedAt || file.item.deletedAt) {
    if (!canPurgeTraining(session.user)) return new NextResponse("Нет", { status: 404 });
  }
  let abs = "";
  try {
    abs = trainingFileAbs(file.relPath);
  } catch {
    return new NextResponse("Нет", { status: 404 });
  }
  const dl = req.nextUrl.searchParams.get("dl") === "1";
  return serveTrainingRange(abs, file.originalName, file.mimeType, req, { inline: !dl });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; fileId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { fileId } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { action?: string };
  try {
    if (body.action === "restore") {
      await restoreTrainingFile(fileId);
      await audit({ userId: session.user.id, action: "training.file.restore", entity: "trainingFile", entityId: fileId });
      return NextResponse.json({ ok: true });
    }
    if (body.action === "purge") {
      if (!canPurgeTraining(session.user)) {
        return NextResponse.json({ error: "Стереть навсегда может только администратор" }, { status: 403 });
      }
      await purgeTrainingFile(fileId);
      await audit({ userId: session.user.id, action: "training.file.purge", entity: "trainingFile", entityId: fileId });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Ошибка" }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string; fileId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { fileId } = await ctx.params;
  try {
    const result = await trashTrainingFile(fileId, session.user.id);
    await audit({ userId: session.user.id, action: "training.file.trash", entity: "trainingFile", entityId: fileId });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Ошибка" }, { status: 400 });
  }
}
