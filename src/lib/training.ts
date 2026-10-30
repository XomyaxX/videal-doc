import { createReadStream } from "fs";
import { copyFile, mkdir, rename, rm, stat } from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "./prisma";
import { assertInside, fileRoot } from "./files";
import { previewMode, titleFromFilename } from "./library-kinds";
import { userCan, type SessionUser } from "./types";
import { fullName } from "./names";
import type { TrainingCard, TrainingFileCard } from "./training-types";

export type { TrainingCard, TrainingFileCard } from "./training-types";

export const TRAINING_MAX_BYTES = 8 * 1024 * 1024 * 1024;
export const TRAINING_MAX_CHUNKS = 2048;

const EXT_MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".txt": "text/plain",
  ".rtf": "application/rtf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".m4v": "video/mp4",
  ".mkv": "video/x-matroska",
  ".avi": "video/x-msvideo",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".zip": "application/zip",
  ".rar": "application/vnd.rar",
  ".7z": "application/x-7z-compressed",
};

export type TrainingKind = "folder" | "video" | "audio" | "image" | "document" | "file";

export const TRAINING_KIND_LABEL: Record<string, string> = {
  folder: "Папка",
  video: "Видео",
  audio: "Аудио",
  image: "Изображение",
  document: "Документ",
  file: "Файл",
};

export function canUseTraining(_user: SessionUser) {
  return true;
}

export function canPurgeTraining(user: SessionUser) {
  return userCan(user, "users.manage");
}

export function trainingRoot() {
  return path.join(/* turbopackIgnore: true */ fileRoot(), "training");
}

function extOf(name: string) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

export function trainingMime(filename: string, declared = "") {
  const ext = extOf(filename);
  if (EXT_MIME[ext]) return EXT_MIME[ext];
  const d = (declared || "").trim();
  if (d && d !== "application/octet-stream") return d;
  return "application/octet-stream";
}

export function guessTrainingKind(filename: string): Exclude<TrainingKind, "folder"> {
  const ext = extOf(filename);
  if ([".mp4", ".webm", ".mov", ".m4v", ".mkv", ".avi"].includes(ext)) return "video";
  if ([".mp3", ".wav", ".ogg", ".flac", ".m4a", ".aac", ".wma"].includes(ext)) return "audio";
  if ([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tif", ".tiff", ".svg"].includes(ext)) return "image";
  if ([".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".rtf", ".odt", ".ods"].includes(ext)) {
    return "document";
  }
  return "file";
}

export function parseTrainingSize(size: string | number | bigint | null | undefined) {
  if (typeof size === "bigint") return Number(size);
  if (typeof size === "number" && Number.isFinite(size)) return size;
  const n = Number(String(size || "0"));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function fmtTrainingSize(size: string | number | bigint | null | undefined) {
  const n = parseTrainingSize(size);
  if (n < 1024) return `${n} Б`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} КБ`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(n >= 10 * 1024 * 1024 ? 0 : 1)} МБ`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} ГБ`;
}

export function trainingFileAbs(relPath: string) {
  const rel = String(relPath || "").replace(/\\/g, "/");
  if (!rel || rel.includes("..")) throw new Error("Некорректный путь");
  return assertInside(fileRoot(), path.join(/* turbopackIgnore: true */ fileRoot(), rel));
}

async function placeFile(sourcePath: string, dest: string) {
  await mkdir(/* turbopackIgnore: true */ path.dirname(dest), { recursive: true });
  try {
    await rename(/* turbopackIgnore: true */ sourcePath, dest);
  } catch {
    await copyFile(/* turbopackIgnore: true */ sourcePath, dest);
    await rm(/* turbopackIgnore: true */ sourcePath, { force: true }).catch(() => null);
  }
}

const AUTHOR_SELECT = { lastName: true, firstName: true, middleName: true } as const;

type ItemRow = {
  id: string;
  title: string;
  description: string;
  kind: string;
  parentId: string | null;
  authorId: string;
  deletedAt: Date | null;
  deletedById: string;
  createdAt: Date;
  updatedAt: Date;
  author?: { lastName: string; firstName: string; middleName: string } | null;
  files?: FileRow[];
};

type FileRow = {
  id: string;
  itemId: string;
  originalName: string;
  mimeType: string;
  size: string;
  relPath: string;
  sortOrder: number;
  deletedAt: Date | null;
  deletedById: string;
  createdAt: Date;
};

function liveFiles(row: ItemRow) {
  return (row.files || []).filter((f) => !f.deletedAt).sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime());
}

export function serializeTraining(row: ItemRow, opts?: { trash?: boolean }): TrainingCard {
  const isFolder = row.kind === "folder";
  const files = (opts?.trash ? row.files || [] : liveFiles(row)).map((f) => {
    const preview = previewMode({ mimeType: f.mimeType, originalName: f.originalName });
    return {
      id: f.id,
      originalName: f.originalName,
      mimeType: f.mimeType,
      size: f.size,
      sizeLabel: fmtTrainingSize(f.size),
      preview,
      fileUrl: `/api/learn/${row.id}/file/${f.id}`,
      thumbUrl: `/api/learn/${row.id}/thumb?file=${f.id}`,
      deletedAt: f.deletedAt ? f.deletedAt.toISOString() : null,
    } satisfies TrainingFileCard;
  });
  const cover = files[0];
  const preview = cover?.preview || "none";
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    kind: row.kind,
    kindLabel: TRAINING_KIND_LABEL[row.kind] || row.kind,
    parentId: row.parentId,
    isFolder,
    originalName: cover?.originalName || "",
    mimeType: cover?.mimeType || "",
    size: cover?.size || "0",
    sizeLabel: cover ? cover.sizeLabel : "",
    preview,
    fileUrl: cover?.fileUrl || "",
    thumbUrl: isFolder ? "" : `/api/learn/${row.id}/thumb`,
    href: isFolder ? `/learn?folder=${row.id}` : `/learn/${row.id}`,
    files,
    fileCount: files.length,
    authorName: row.author ? fullName(row.author) : "",
    createdAt: row.createdAt.toISOString(),
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
  };
}

export async function trainingCrumbs(folderId: string) {
  const crumbs: { id: string; title: string }[] = [];
  let id: string | null = folderId;
  for (let i = 0; i < 20 && id; i++) {
    const row: { id: string; title: string; parentId: string | null } | null = await prisma.trainingItem.findUnique({
      where: { id },
      select: { id: true, title: true, parentId: true },
    });
    if (!row) break;
    crumbs.unshift({ id: row.id, title: row.title });
    id = row.parentId;
  }
  return crumbs;
}

async function assertFolder(parentId: string) {
  const folder = await prisma.trainingItem.findFirst({
    where: { id: parentId, kind: "folder", deletedAt: null },
    select: { id: true },
  });
  if (!folder) throw new Error("Нет такой папки");
  return folder.id;
}

export async function createTrainingFolder(opts: { userId: string; title: string; parentId?: string }) {
  const title = opts.title.trim().slice(0, 200);
  if (!title) throw new Error("Напишите название папки");
  const parentId = opts.parentId ? await assertFolder(opts.parentId) : null;
  return prisma.trainingItem.create({
    data: {
      title,
      kind: "folder",
      parentId,
      authorId: opts.userId,
    },
  });
}

export async function createTrainingItemFromDisk(opts: {
  userId: string;
  title?: string;
  description?: string;
  parentId?: string;
  originalName: string;
  mime?: string;
  size: number;
  sourcePath: string;
}) {
  if (opts.size <= 0) throw new Error("Пустой файл");
  if (opts.size > TRAINING_MAX_BYTES) throw new Error("Файл больше 8 ГБ");
  const originalName = opts.originalName.slice(0, 200);
  const title = (opts.title || titleFromFilename(originalName)).trim().slice(0, 200) || originalName;
  const description = (opts.description || "").trim().slice(0, 4000);
  const parentId = opts.parentId ? await assertFolder(opts.parentId) : null;
  const kind = guessTrainingKind(originalName);
  const mime = trainingMime(originalName, opts.mime);
  const item = await prisma.trainingItem.create({
    data: {
      title,
      description,
      kind,
      parentId,
      authorId: opts.userId,
    },
  });
  try {
    await attachDiskFile({
      itemId: item.id,
      originalName,
      mime,
      size: opts.size,
      sourcePath: opts.sourcePath,
    });
  } catch (e) {
    await prisma.trainingItem.delete({ where: { id: item.id } }).catch(() => null);
    throw e;
  }
  return prisma.trainingItem.findUniqueOrThrow({
    where: { id: item.id },
    include: { author: { select: AUTHOR_SELECT }, files: true },
  });
}

export async function addTrainingFileFromDisk(opts: {
  itemId: string;
  userId: string;
  originalName: string;
  mime?: string;
  size: number;
  sourcePath: string;
}) {
  if (opts.size <= 0) throw new Error("Пустой файл");
  if (opts.size > TRAINING_MAX_BYTES) throw new Error("Файл больше 8 ГБ");
  const item = await prisma.trainingItem.findFirst({
    where: { id: opts.itemId, deletedAt: null },
    include: { files: { where: { deletedAt: null } } },
  });
  if (!item) throw new Error("Нет такой карточки");
  if (item.kind === "folder") throw new Error("В папку файлы кладут как отдельные материалы");
  const originalName = opts.originalName.slice(0, 200);
  const mime = trainingMime(originalName, opts.mime);
  await attachDiskFile({
    itemId: item.id,
    originalName,
    mime,
    size: opts.size,
    sourcePath: opts.sourcePath,
    sortOrder: item.files.length,
  });
  const kind = guessTrainingKind(originalName);
  if (item.kind === "file" && kind !== "file") {
    await prisma.trainingItem.update({ where: { id: item.id }, data: { kind } });
  }
  return prisma.trainingItem.findUniqueOrThrow({
    where: { id: item.id },
    include: { author: { select: AUTHOR_SELECT }, files: true },
  });
}

async function attachDiskFile(opts: {
  itemId: string;
  originalName: string;
  mime: string;
  size: number;
  sourcePath: string;
  sortOrder?: number;
}) {
  const ext = extOf(opts.originalName) || "";
  const file = await prisma.trainingFile.create({
    data: {
      itemId: opts.itemId,
      originalName: opts.originalName,
      mimeType: opts.mime,
      size: String(opts.size),
      relPath: "pending",
      sortOrder: opts.sortOrder || 0,
    },
  });
  const relPath = path.posix.join("training", opts.itemId, `${file.id}${ext}`);
  const dest = trainingFileAbs(relPath);
  try {
    await placeFile(opts.sourcePath, dest);
    const st = await stat(/* turbopackIgnore: true */ dest);
    await prisma.trainingFile.update({
      where: { id: file.id },
      data: { relPath, size: String(st.size) },
    });
  } catch (e) {
    await rm(/* turbopackIgnore: true */ dest, { force: true }).catch(() => null);
    await prisma.trainingFile.delete({ where: { id: file.id } }).catch(() => null);
    throw e;
  }
}

export async function updateTrainingItem(opts: {
  id: string;
  title?: string;
  description?: string;
  parentId?: string | null;
}) {
  const row = await prisma.trainingItem.findFirst({ where: { id: opts.id, deletedAt: null } });
  if (!row) throw new Error("Нет такой карточки");
  const data: { title?: string; description?: string; parentId?: string | null } = {};
  if (opts.title !== undefined) {
    const title = opts.title.trim().slice(0, 200);
    if (!title) throw new Error("Напишите название");
    data.title = title;
  }
  if (opts.description !== undefined) data.description = opts.description.trim().slice(0, 4000);
  if (opts.parentId !== undefined) {
    if (opts.parentId) {
      if (opts.parentId === row.id) throw new Error("Нельзя положить папку саму в себя");
      const dest = await assertFolder(opts.parentId);
      let cursor: string | null = dest;
      for (let i = 0; i < 20 && cursor; i++) {
        if (cursor === row.id) throw new Error("Нельзя положить папку саму в себя");
        const parent: { parentId: string | null } | null = await prisma.trainingItem.findUnique({
          where: { id: cursor },
          select: { parentId: true },
        });
        cursor = parent?.parentId || null;
      }
      data.parentId = dest;
    } else {
      data.parentId = null;
    }
  }
  return prisma.trainingItem.update({
    where: { id: row.id },
    data,
    include: { author: { select: AUTHOR_SELECT }, files: true },
  });
}

async function descendantIds(rootId: string) {
  const ids = [rootId];
  const queue = [rootId];
  while (queue.length) {
    const parentId = queue.shift()!;
    const kids = await prisma.trainingItem.findMany({
      where: { parentId, deletedAt: null },
      select: { id: true },
    });
    for (const k of kids) {
      ids.push(k.id);
      queue.push(k.id);
    }
  }
  return ids;
}

export async function trashTrainingItem(id: string, userId: string) {
  const row = await prisma.trainingItem.findFirst({ where: { id, deletedAt: null } });
  if (!row) throw new Error("Нет такой карточки");
  const ids = row.kind === "folder" ? await descendantIds(row.id) : [row.id];
  const now = new Date();
  await prisma.$transaction([
    prisma.trainingItem.updateMany({
      where: { id: { in: ids }, deletedAt: null },
      data: { deletedAt: now, deletedById: userId },
    }),
    prisma.trainingFile.updateMany({
      where: { itemId: { in: ids }, deletedAt: null },
      data: { deletedAt: now, deletedById: userId },
    }),
  ]);
}

export async function trashTrainingFile(fileId: string, userId: string) {
  const file = await prisma.trainingFile.findFirst({
    where: { id: fileId, deletedAt: null },
    include: { item: { include: { files: { where: { deletedAt: null } } } } },
  });
  if (!file || file.item.deletedAt) throw new Error("Нет такого файла");
  const now = new Date();
  const last = file.item.files.length <= 1 && file.item.kind !== "folder";
  await prisma.$transaction([
    prisma.trainingFile.update({
      where: { id: file.id },
      data: { deletedAt: now, deletedById: userId },
    }),
    ...(last
      ? [
          prisma.trainingItem.update({
            where: { id: file.itemId },
            data: { deletedAt: now, deletedById: userId },
          }),
        ]
      : []),
  ]);
  return { itemTrashed: last };
}

export async function restoreTrainingItem(id: string) {
  const row = await prisma.trainingItem.findFirst({ where: { id } });
  if (!row) throw new Error("Нет такой карточки");
  const ids = [row.id];
  const queue = [row.id];
  while (queue.length) {
    const parentId = queue.shift()!;
    const kids = await prisma.trainingItem.findMany({
      where: { parentId, deletedAt: { not: null } },
      select: { id: true },
    });
    for (const k of kids) {
      ids.push(k.id);
      queue.push(k.id);
    }
  }
  await prisma.$transaction([
    prisma.trainingItem.updateMany({
      where: { id: { in: ids } },
      data: { deletedAt: null, deletedById: "" },
    }),
    prisma.trainingFile.updateMany({
      where: { itemId: { in: ids } },
      data: { deletedAt: null, deletedById: "" },
    }),
  ]);
}

export async function restoreTrainingFile(fileId: string) {
  const file = await prisma.trainingFile.findFirst({
    where: { id: fileId },
    include: { item: true },
  });
  if (!file) throw new Error("Нет такого файла");
  await prisma.$transaction([
    prisma.trainingFile.update({
      where: { id: file.id },
      data: { deletedAt: null, deletedById: "" },
    }),
    prisma.trainingItem.update({
      where: { id: file.itemId },
      data: { deletedAt: null, deletedById: "" },
    }),
  ]);
}

async function unlinkRel(relPath: string) {
  try {
    const abs = trainingFileAbs(relPath);
    await rm(/* turbopackIgnore: true */ abs, { force: true });
  } catch {
    /* already gone */
  }
}

export async function purgeTrainingItem(id: string) {
  const row = await prisma.trainingItem.findFirst({
    where: { id },
    include: { files: true, children: { select: { id: true } } },
  });
  if (!row) throw new Error("Нет такой карточки");
  if (!row.deletedAt) throw new Error("Сначала уберите в корзину");
  const ids = [row.id];
  const queue = [row.id];
  while (queue.length) {
    const parentId = queue.shift()!;
    const kids = await prisma.trainingItem.findMany({
      where: { parentId },
      select: { id: true },
    });
    for (const k of kids) {
      ids.push(k.id);
      queue.push(k.id);
    }
  }
  const files = await prisma.trainingFile.findMany({ where: { itemId: { in: ids } } });
  for (const f of files) await unlinkRel(f.relPath);
  for (const itemId of ids) {
    await rm(/* turbopackIgnore: true */ path.join(trainingRoot(), itemId), { recursive: true, force: true }).catch(() => null);
  }
  await prisma.trainingItem.deleteMany({ where: { id: { in: ids } } });
}

export async function purgeTrainingFile(fileId: string) {
  const file = await prisma.trainingFile.findFirst({
    where: { id: fileId },
    include: { item: { include: { files: true } } },
  });
  if (!file) throw new Error("Нет такого файла");
  if (!file.deletedAt && !file.item.deletedAt) throw new Error("Сначала уберите в корзину");
  await unlinkRel(file.relPath);
  await prisma.trainingFile.delete({ where: { id: file.id } });
  const left = await prisma.trainingFile.count({ where: { itemId: file.itemId } });
  if (left === 0 && file.item.kind !== "folder") {
    await rm(/* turbopackIgnore: true */ path.join(trainingRoot(), file.itemId), { recursive: true, force: true }).catch(() => null);
    await prisma.trainingItem.delete({ where: { id: file.itemId } });
  }
}

export async function serveTrainingRange(
  abs: string,
  name: string,
  mime: string,
  req: NextRequest,
  opts: { inline: boolean },
) {
  const st = await stat(/* turbopackIgnore: true */ abs);
  const size = st.size;
  const range = req.headers.get("range");
  const disp = `${opts.inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(name)}`;
  const common: Record<string, string> = {
    "Content-Type": mime || "application/octet-stream",
    "Content-Disposition": disp,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, max-age=300",
    "Accept-Ranges": "bytes",
  };
  const m = range ? /bytes=(\d+)-(\d*)/.exec(range) : null;
  let start = 0;
  let end = size - 1;
  let status = 200;
  if (m) {
    start = Number(m[1]);
    end = m[2] ? Number(m[2]) : size - 1;
    if (size <= 0 || start >= size || start < 0) {
      return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    end = Math.min(end, size - 1);
    if (start > end) {
      return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    status = 206;
    common["Content-Range"] = `bytes ${start}-${end}/${size}`;
  }
  common["Content-Length"] = String(end - start + 1);
  const node = createReadStream(/* turbopackIgnore: true */ abs, { start, end });
  return new NextResponse(Readable.toWeb(node) as unknown as ReadableStream, { status, headers: common });
}
