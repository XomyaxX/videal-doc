import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  canPurgeTraining,
  purgeTrainingItem,
  restoreTrainingItem,
  serializeTraining,
  trashTrainingItem,
  updateTrainingItem,
} from "@/lib/training";
import { audit } from "@/lib/audit";
import { USER_SAFE_SELECT } from "@/lib/user-public";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await ctx.params;
  const row = await prisma.trainingItem.findFirst({
    where: { id, deletedAt: null },
    include: { author: { select: USER_SAFE_SELECT }, files: { orderBy: { sortOrder: "asc" } } },
  });
  if (!row) return NextResponse.json({ error: "Нет" }, { status: 404 });
  return NextResponse.json(serializeTraining(row));
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    title?: string;
    description?: string;
    parentId?: string | null;
  };
  try {
    const row = await updateTrainingItem({
      id,
      title: body.title,
      description: body.description,
      parentId: body.parentId,
    });
    await audit({
      userId: session.user.id,
      action: "training.edit",
      entity: "training",
      entityId: id,
      details: row.title,
    });
    return NextResponse.json(serializeTraining(row));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Ошибка" }, { status: 400 });
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { action?: string };
  try {
    if (body.action === "restore") {
      await restoreTrainingItem(id);
      await audit({ userId: session.user.id, action: "training.restore", entity: "training", entityId: id });
      return NextResponse.json({ ok: true });
    }
    if (body.action === "purge") {
      if (!canPurgeTraining(session.user)) {
        return NextResponse.json({ error: "Стереть навсегда может только администратор" }, { status: 403 });
      }
      await purgeTrainingItem(id);
      await audit({ userId: session.user.id, action: "training.purge", entity: "training", entityId: id });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Ошибка" }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await ctx.params;
  try {
    await trashTrainingItem(id, session.user.id);
    await audit({ userId: session.user.id, action: "training.trash", entity: "training", entityId: id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Ошибка" }, { status: 400 });
  }
}
