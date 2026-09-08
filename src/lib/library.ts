import { createHash, randomUUID } from "crypto";
import { mkdir, writeFile, readFile } from "fs/promises";
import path from "path";
import { prisma } from "./prisma";
import { fileRoot, safeFilePart } from "./files";
import { shareRoot, toUnc, canLeadProd } from "./prod";
import { userCan, type SessionUser } from "./types";
import { LIBRARY_KIND_EXT, LIBRARY_KIND_LABEL, libraryKindOk, previewMode } from "./library-kinds";

export { LIBRARY_KINDS, LIBRARY_KIND_LABEL, libraryKindOk, previewMode } from "./library-kinds";
export type { LibraryKind } from "./library-kinds";

const KIND_EXT = LIBRARY_KIND_EXT;

const PREVIEW_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

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
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
};

const BLOCKED = new Set([".exe", ".bat", ".cmd", ".com", ".msi", ".dll", ".sh", ".ps1", ".js", ".vbs", ".scr"]);

export function canViewLibrary(user: SessionUser) {
  return userCan(user, "prod.work") || userCan(user, "prod.lead") || userCan(user, "prod.manage");
}

export function canManageLibrary(user: SessionUser) {
  return canLeadProd(user);
}

function safePart(name: string) {
  return safeFilePart(name);
}

async function storeWebFile(opts: {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  userId: string;
}) {
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

async function copyPackFile(opts: { dir: string; originalName: string; buffer: Buffer }) {
  const ext = path.extname(opts.originalName).toLowerCase() || "";
  const stem = safePart(path.basename(opts.originalName, ext));
  let name = `${stem}${ext}`;
  let abs = path.join(/* turbopackIgnore: true */ opts.dir, name);
  let n = 2;
  while (true) {
    try {
      await writeFile(/* turbopackIgnore: true */ abs, opts.buffer, { flag: "wx" });
      return abs;
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code !== "EEXIST") throw e;
      name = `${stem}_${n}${ext}`;
      abs = path.join(/* turbopackIgnore: true */ opts.dir, name);
      n += 1;
    }
  }
}

type IncomingFile = { buffer: Buffer; originalName: string; mime: string };

function validateIncoming(file: IncomingFile, kind: string, maxBytes: number) {
  if (file.buffer.length === 0) throw new Error(`Пустой файл: ${file.originalName}`);
  if (file.buffer.length > maxBytes) throw new Error(`Слишком большой: ${file.originalName}`);
  const ext = path.extname(file.originalName).toLowerCase();
  if (!ext || BLOCKED.has(ext)) throw new Error(`Этот тип нельзя загрузить: ${file.originalName}`);
  const allowed = KIND_EXT[kind] || [];
  if (!allowed.includes(ext)) {
    throw new Error(`«${file.originalName}» не подходит для «${LIBRARY_KIND_LABEL[kind]}» (${allowed.join(", ")})`);
  }
  return EXT_MIME[ext] || file.mime || "application/octet-stream";
}

export async function saveLibraryItem(opts: {
  user: SessionUser;
  title: string;
  kind: string;
  description: string;
  files: IncomingFile[];
  preview?: IncomingFile | null;
  maxBytes: number;
}) {
  const title = opts.title.trim();
  const description = opts.description.trim();
  if (!title) throw new Error("Укажите название блока");
  if (!libraryKindOk(opts.kind)) throw new Error("Выберите тип");
  if (!description) throw new Error("Добавьте описание — сотруднику должно быть понятно, что это");
  const incoming = opts.files.filter((f) => f.buffer.length > 0);
  if (incoming.length === 0) throw new Error("Приложите хотя бы один файл");

  const mimes = incoming.map((f) => validateIncoming(f, opts.kind, opts.maxBytes));

  let previewFileId = "";
  if (opts.preview && opts.preview.buffer.length > 0) {
    const pext = path.extname(opts.preview.originalName).toLowerCase();
    if (!PREVIEW_EXT.has(pext)) throw new Error("Превью — только PNG, JPG или WEBP");
    if (opts.preview.buffer.length > 20 * 1024 * 1024) throw new Error("Превью слишком большое");
    const savedPreview = await storeWebFile({
      buffer: opts.preview.buffer,
      originalName: opts.preview.originalName,
      mimeType: EXT_MIME[pext] || "image/jpeg",
      userId: opts.user.id,
    });
    previewFileId = savedPreview.id;
  }

  const year = new Date().toISOString().slice(0, 4);
  const packDir = path.join(
    shareRoot(),
    "Library",
    opts.kind,
    year,
    `${safePart(title)}_${Date.now().toString(36)}`,
  );
  await mkdir(/* turbopackIgnore: true */ packDir, { recursive: true });

  const savedFiles: {
    originalName: string;
    mimeType: string;
    size: number;
    fileId: string;
    absPath: string;
    uncPath: string;
    sortOrder: number;
  }[] = [];

  for (let i = 0; i < incoming.length; i++) {
    const file = incoming[i];
    const mime = mimes[i];
    const absPath = await copyPackFile({
      dir: packDir,
      originalName: file.originalName,
      buffer: file.buffer,
    });
    let fileId = "";
    const keepWeb =
      file.buffer.length <= 80 * 1024 * 1024 ||
      previewMode({ mimeType: mime, originalName: file.originalName }) !== "none";
    if (keepWeb) {
      const saved = await storeWebFile({
        buffer: file.buffer,
        originalName: file.originalName,
        mimeType: mime,
        userId: opts.user.id,
      });
      fileId = saved.id;
    }
    savedFiles.push({
      originalName: path.basename(file.originalName).slice(0, 200),
      mimeType: mime,
      size: file.buffer.length,
      fileId,
      absPath,
      uncPath: toUnc(absPath),
      sortOrder: i,
    });
  }

  const cover = savedFiles[0];
  return prisma.libraryItem.create({
    data: {
      title: title.slice(0, 200),
      kind: opts.kind,
      description: description.slice(0, 2000),
      originalName: cover.originalName,
      mimeType: cover.mimeType,
      size: savedFiles.reduce((s, f) => s + f.size, 0),
      fileId: cover.fileId,
      previewFileId,
      absPath: packDir,
      uncPath: toUnc(packDir),
      authorId: opts.user.id,
      files: { create: savedFiles },
    },
    include: { files: { orderBy: { sortOrder: "asc" } } },
  });
}

export async function backfillLibraryFiles() {
  const rows = await prisma.libraryItem.findMany({
    where: { files: { none: {} }, deletedAt: null },
  });
  let n = 0;
  for (const row of rows) {
    if (!row.fileId && !row.absPath) continue;
    await prisma.libraryFile.create({
      data: {
        itemId: row.id,
        originalName: row.originalName || "file",
        mimeType: row.mimeType,
        size: row.size,
        fileId: row.fileId,
        absPath: row.absPath,
        uncPath: row.uncPath,
        sortOrder: 0,
      },
    });
    n += 1;
  }
  return n;
}

/** Убрать файл из блока. С диска копия не удаляется. Последний файл — скрывает весь блок. */
export async function removeLibraryFile(itemId: string, fileId: string): Promise<{ hidden: boolean; name: string }> {
  const item = await prisma.libraryItem.findFirst({
    where: { id: itemId, deletedAt: null },
    include: { files: { orderBy: { sortOrder: "asc" } } },
  });
  if (!item) throw new Error("Нет блока");

  const file = item.files.find((f) => f.id === fileId);
  const legacyAlone =
    !file &&
    item.files.length === 0 &&
    (fileId === item.id || fileId === "cover" || fileId === "one");

  if (legacyAlone) {
    await prisma.libraryItem.update({
      where: { id: itemId },
      data: { deletedAt: new Date() },
    });
    return { hidden: true, name: item.originalName };
  }
  if (!file) throw new Error("Нет файла");

  const remaining = item.files.filter((f) => f.id !== file.id);

  await prisma.$transaction(async (tx) => {
    await tx.libraryFile.delete({ where: { id: file.id } });
    if (remaining.length === 0) {
      await tx.libraryItem.update({
        where: { id: itemId },
        data: { deletedAt: new Date(), size: 0 },
      });
      return;
    }
    const cover =
      remaining.find((f) => previewMode(f) === "image") ||
      remaining.find((f) => previewMode(f) !== "none") ||
      remaining[0];
    await tx.libraryItem.update({
      where: { id: itemId },
      data: {
        originalName: cover.originalName,
        mimeType: cover.mimeType,
        size: remaining.reduce((s, f) => s + f.size, 0),
        fileId: cover.fileId,
      },
    });
  });

  return { hidden: remaining.length === 0, name: file.originalName };
}

export async function readLibraryBytes(item: {
  fileId: string;
  absPath: string;
  originalName: string;
  mimeType: string;
}) {
  if (item.fileId) {
    const rec = await prisma.storedFile.findUnique({ where: { id: item.fileId } });
    if (rec) {
      const abs = path.join(/* turbopackIgnore: true */ fileRoot(), rec.path);
      const buffer = await readFile(/* turbopackIgnore: true */ abs);
      return { buffer, mime: rec.mimeType || item.mimeType, name: rec.originalName || item.originalName };
    }
  }
  if (item.absPath) {
    const buffer = await readFile(/* turbopackIgnore: true */ item.absPath);
    return { buffer, mime: item.mimeType || "application/octet-stream", name: item.originalName };
  }
  return null;
}

export async function attachLibraryToTask(taskId: string, itemIds: string[]) {
  const ids = Array.from(new Set(itemIds.map(String).filter(Boolean)));
  if (ids.length === 0) {
    await prisma.taskLibraryItem.deleteMany({ where: { taskId } });
    return;
  }
  const existing = await prisma.libraryItem.findMany({
    where: { id: { in: ids }, deletedAt: null },
    select: { id: true },
  });
  const ok = new Set(existing.map((r) => r.id));
  if (ok.size === 0) {
    await prisma.taskLibraryItem.deleteMany({ where: { taskId } });
    return;
  }
  await prisma.taskLibraryItem.deleteMany({
    where: { taskId, itemId: { notIn: [...ok] } },
  });
  for (const itemId of ok) {
    await prisma.taskLibraryItem.upsert({
      where: { taskId_itemId: { taskId, itemId } },
      create: { taskId, itemId },
      update: {},
    });
  }
}

type FileRow = {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  fileId: string;
  absPath: string;
  uncPath: string;
};

function packFiles(row: {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  fileId: string;
  absPath?: string;
  uncPath: string;
  files?: FileRow[];
}): FileRow[] {
  if (row.files && row.files.length > 0) return row.files;
  if (row.fileId || row.absPath) {
    return [
      {
        id: row.id,
        originalName: row.originalName,
        mimeType: row.mimeType,
        size: row.size,
        fileId: row.fileId,
        absPath: row.absPath || "",
        uncPath: row.uncPath,
      },
    ];
  }
  return [];
}

export function serializeLibrary(row: {
  id: string;
  title: string;
  kind: string;
  description: string;
  originalName: string;
  mimeType: string;
  size: number;
  fileId: string;
  previewFileId: string;
  uncPath: string;
  createdAt: Date;
  files?: FileRow[];
  author?: { lastName: string; firstName: string; middleName?: string | null } | null;
}) {
  const files = packFiles(row);
  const cover =
    files.find((f) => previewMode(f) === "image") ||
    files.find((f) => previewMode(f) !== "none") ||
    files[0] ||
    row;
  const mode = previewMode({
    mimeType: cover.mimeType || row.mimeType,
    originalName: cover.originalName || row.originalName,
    previewFileId: row.previewFileId,
  });
  const serializedFiles = files.map((f) => {
    const preview = previewMode(f);
    return {
      id: f.id,
      originalName: f.originalName,
      mimeType: f.mimeType,
      size: f.size,
      uncPath: f.uncPath,
      preview,
      fileUrl: `/api/library/${row.id}/file/${f.id}`,
      thumbUrl: preview === "image" ? `/api/library/${row.id}/file/${f.id}` : "",
    };
  });
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    kindLabel: LIBRARY_KIND_LABEL[row.kind] || row.kind,
    description: row.description,
    originalName: cover.originalName || row.originalName,
    mimeType: cover.mimeType || row.mimeType,
    size: row.size,
    fileId: cover.fileId || row.fileId,
    previewFileId: row.previewFileId,
    uncPath: row.uncPath,
    createdAt: row.createdAt,
    fileCount: serializedFiles.length,
    files: serializedFiles,
    preview: mode,
    thumbUrl: mode === "image" || row.previewFileId ? `/api/library/${row.id}/thumb` : "",
    fileUrl: serializedFiles[0]?.fileUrl || `/api/library/${row.id}/file`,
    href: `/library/${row.id}`,
  };
}
