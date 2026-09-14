import { createHash, randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { prisma } from "./prisma";
import { assertInside, fileRoot, safeFilePart } from "./files";
import { canLeadProd, canManageProd, canSeeProdTask, shareRoot, toUnc } from "./prod";
import { previewMode } from "./library-kinds";
import { storeGlbPreview } from "./glb-convert";
import { notifyMany } from "./notify";
import { fullName } from "./names";
import type { SessionUser } from "./types";

const BLOCKED = new Set([".exe", ".bat", ".cmd", ".com", ".msi", ".dll", ".sh", ".ps1", ".js", ".vbs", ".scr"]);

export function taskThreadKey(taskId: string) {
  return `task:${taskId}`;
}

export function taskChatScope(task: {
  shotId?: string | null;
  sceneId?: string | null;
  assetId?: string | null;
}): string | null {
  if (task.shotId) return `shot:${task.shotId}`;
  if (task.assetId) return `asset:${task.assetId}`;
  if (task.sceneId) return `scene:${task.sceneId}`;
  return null;
}

function scopeWhere(scopeKey: string) {
  const i = scopeKey.indexOf(":");
  const kind = i >= 0 ? scopeKey.slice(0, i) : "";
  const id = i >= 0 ? scopeKey.slice(i + 1) : "";
  if (kind === "shot") return { shotId: id };
  if (kind === "asset") return { assetId: id };
  if (kind === "scene") return { sceneId: id, shotId: null };
  return { id: "__none__" };
}

export async function loadChatTask(taskId: string) {
  return prisma.task.findUnique({
    where: { id: taskId },
    include: {
      assignee: { include: { department: true } },
      shot: { select: { id: true, code: true } },
      scene: { select: { id: true, code: true, title: true } },
      asset: { select: { id: true, name: true } },
    },
  });
}

export async function siblingChatTasks(scopeKey: string) {
  return prisma.task.findMany({
    where: { ...scopeWhere(scopeKey), deletedAt: null },
    select: {
      id: true,
      stage: true,
      status: true,
      assigneeId: true,
      helperId: true,
      assignee: { select: { id: true, lastName: true, firstName: true, middleName: true } },
      helper: { select: { id: true, lastName: true, firstName: true, middleName: true } },
    },
  });
}

export async function canSeeTaskChat(user: SessionUser, taskId: string) {
  const task = await loadChatTask(taskId);
  if (!task) return false;
  return canSeeProdTask(user, task);
}

export async function canWriteTaskChat(user: SessionUser, taskId: string) {
  if (canManageProd(user) || canLeadProd(user)) return true;
  const task = await loadChatTask(taskId);
  if (!task) return false;
  return task.assigneeId === user.id || task.helperId === user.id;
}

export function chatTitle(task: {
  shot?: { code: string } | null;
  scene?: { code: string; title: string } | null;
  asset?: { name: string } | null;
}) {
  if (task.shot && task.scene) return `Чат шота ${task.scene.code} · ${task.shot.code}`;
  if (task.asset) return `Чат ассета ${task.asset.name}`;
  if (task.scene) return `Чат сцены ${task.scene.code}`;
  return "Чат команды";
}

async function storeWebFile(opts: { buffer: Buffer; originalName: string; mimeType: string; userId: string }) {
  const id = randomUUID();
  const ext = path.extname(opts.originalName).toLowerCase() || "";
  const rel = `${id}${ext}`;
  const dir = fileRoot();
  await mkdir(/* turbopackIgnore: true */ dir, { recursive: true });
  const abs = path.join(/* turbopackIgnore: true */ dir, rel);
  await writeFile(/* turbopackIgnore: true */ abs, opts.buffer);
  const sha256 = createHash("sha256").update(opts.buffer).digest("hex");
  return prisma.storedFile.create({
    data: {
      id,
      originalName: path.basename(opts.originalName).slice(0, 200),
      mimeType: opts.mimeType || "application/octet-stream",
      size: opts.buffer.length,
      path: rel,
      sha256,
      createdById: opts.userId,
    },
  });
}

async function copyChatFile(dir: string, originalName: string, buffer: Buffer) {
  const ext = path.extname(originalName).toLowerCase() || "";
  const stem = safeFilePart(path.basename(originalName, ext));
  let name = `${stem}${ext}`;
  let abs = path.join(/* turbopackIgnore: true */ dir, name);
  let n = 2;
  while (true) {
    try {
      await writeFile(/* turbopackIgnore: true */ abs, buffer, { flag: "wx" });
      return abs;
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code !== "EEXIST") throw e;
      name = `${stem}_${n}${ext}`;
      abs = path.join(/* turbopackIgnore: true */ dir, name);
      n += 1;
    }
  }
}

export async function postTaskChatMessage(opts: {
  user: SessionUser;
  taskId: string;
  body: string;
  files: { buffer: Buffer; originalName: string; mime: string }[];
  maxBytes: number;
}) {
  if (!(await canWriteTaskChat(opts.user, opts.taskId))) throw new Error("Нет права писать в чат");
  const task = await loadChatTask(opts.taskId);
  if (!task) throw new Error("Нет задачи");
  const scopeKey = taskThreadKey(opts.taskId);
  const body = opts.body.trim().slice(0, 4000);
  const incoming = opts.files.filter((f) => f.buffer.length > 0);
  if (!body && incoming.length === 0) throw new Error("Напишите текст или приложите файл");

  const chatDir = path.join(
    /* turbopackIgnore: true */ shareRoot(),
    "ProdChat",
    safeFilePart(scopeKey.replace(":", "_")),
  );
  await mkdir(/* turbopackIgnore: true */ chatDir, { recursive: true });

  const saved: {
    originalName: string;
    mimeType: string;
    size: number;
    fileId: string;
    previewFileId: string;
    absPath: string;
    uncPath: string;
    uploadedById: string;
  }[] = [];

  for (const file of incoming) {
    if (file.buffer.length > opts.maxBytes) throw new Error(`Слишком большой: ${file.originalName}`);
    const ext = path.extname(file.originalName).toLowerCase();
    if (BLOCKED.has(ext)) throw new Error(`Этот тип нельзя: ${file.originalName}`);
    const mime = file.mime || "application/octet-stream";
    const absPath = await copyChatFile(chatDir, file.originalName, file.buffer);
    assertInside(shareRoot(), absPath);
    let fileId = "";
    const preview = previewMode({ mimeType: mime, originalName: file.originalName });
    const keepWeb = file.buffer.length <= 80 * 1024 * 1024 || preview !== "none";
    if (keepWeb) {
      const rec = await storeWebFile({
        buffer: file.buffer,
        originalName: file.originalName,
        mimeType: mime,
        userId: opts.user.id,
      });
      fileId = rec.id;
    }
    if (fileId) {
      const capturedId = fileId;
      void storeGlbPreview({
        buffer: file.buffer,
        originalName: file.originalName,
        userId: opts.user.id,
        maxBytes: opts.maxBytes,
      }).then((pid) => {
        if (!pid) return;
        return prisma.prodChatFile.updateMany({ where: { fileId: capturedId }, data: { previewFileId: pid } });
      });
    }
    saved.push({
      originalName: path.basename(file.originalName).slice(0, 200),
      mimeType: mime,
      size: file.buffer.length,
      fileId,
      previewFileId: "",
      absPath,
      uncPath: toUnc(absPath),
      uploadedById: opts.user.id,
    });
  }

  const row = await prisma.prodChatMessage.create({
    data: {
      scopeKey,
      authorId: opts.user.id,
      body,
      files: saved.length ? { create: saved } : undefined,
    },
    include: {
      author: { select: { lastName: true, firstName: true, middleName: true } },
      files: true,
    },
  });

  const others = [...new Set([task.assigneeId, task.helperId].filter((id): id is string => Boolean(id) && id !== opts.user.id))];
  if (others.length) {
    const who = fullName(row.author);
    void notifyMany(others, {
      title: "Чат задачи",
      body: body ? `${who}: ${body.slice(0, 120)}` : `${who} прислал файл`,
      link: `/prod/tasks/${opts.taskId}`,
      urgency: "normal",
    }).catch((e) => console.error("prod-chat.notify", e));
  }

  return row;
}

export function serializeProdChatFile(
  taskId: string,
  f: { id: string; originalName: string; mimeType: string; size: number; uncPath: string; previewFileId?: string },
) {
  const preview = f.previewFileId ? "model3d" : previewMode(f);
  const fileUrl = `/api/prod/tasks/${taskId}/chat/file/${f.id}`;
  return {
    id: f.id,
    originalName: f.originalName,
    mimeType: f.mimeType,
    size: f.size,
    uncPath: f.uncPath,
    preview,
    fileUrl,
    previewUrl: f.previewFileId ? `${fileUrl}?preview=1` : preview === "model3d" ? fileUrl : "",
    thumbUrl: preview === "image" ? fileUrl : "",
  };
}
