import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userCan } from "@/lib/types";
import { fullName } from "@/lib/names";
import {
  canSeeTaskChat,
  canWriteTaskChat,
  loadChatTask,
  postTaskChatMessage,
  serializeProdChatFile,
  taskChatScope,
} from "@/lib/prod-chat";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !userCan(session.user, "prod.view")) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!(await canSeeTaskChat(session.user, id))) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const task = await loadChatTask(id);
  const scopeKey = task ? taskChatScope(task) : null;
  if (!scopeKey) return NextResponse.json({ rows: [] });
  const rows = await prisma.prodChatMessage.findMany({
    where: { scopeKey, deletedAt: null },
    include: {
      author: { select: { lastName: true, firstName: true, middleName: true } },
      files: { orderBy: { createdAt: "asc" } },
    },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  return NextResponse.json({
    rows: rows.map((m) => ({
      id: m.id,
      body: m.body,
      createdAt: m.createdAt,
      authorId: m.authorId,
      authorName: fullName(m.author),
      files: m.files.map((f) => serializeProdChatFile(id, f)),
    })),
  });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await ctx.params;
  if (!(await canWriteTaskChat(session.user, id))) {
    return NextResponse.json({ error: "Нет права писать в чат" }, { status: 403 });
  }
  const settings = await prisma.appSettings.findUnique({ where: { id: "default" } });
  const maxBytes = (settings?.maxUploadMb || 32) * 1024 * 1024;
  const form = await req.formData();
  const files: { buffer: Buffer; originalName: string; mime: string }[] = [];
  for (const [key, value] of form.entries()) {
    if (key !== "files" && key !== "file") continue;
    if (!(value instanceof File)) continue;
    files.push({
      buffer: Buffer.from(await value.arrayBuffer()),
      originalName: value.name,
      mime: value.type,
    });
  }
  try {
    const row = await postTaskChatMessage({
      user: session.user,
      taskId: id,
      body: String(form.get("body") || ""),
      files,
      maxBytes,
    });
    return NextResponse.json({
      id: row.id,
      body: row.body,
      createdAt: row.createdAt,
      authorId: row.authorId,
      authorName: fullName(row.author),
      files: row.files.map((f) => serializeProdChatFile(id, f)),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Ошибка" }, { status: 400 });
  }
}
