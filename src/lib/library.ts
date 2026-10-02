import { createHash, randomBytes, randomUUID } from "crypto";
import { createReadStream, createWriteStream } from "fs";
import { mkdir, writeFile, readFile, stat } from "fs/promises";
import { pipeline } from "stream/promises";
import { PassThrough, Readable } from "stream";
import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { prisma } from "./prisma";
import { fileRoot, safeFilePart } from "./files";
import { shareRoot, toUnc, canLeadProd } from "./prod";
import { userCan, type SessionUser } from "./types";
import { LIBRARY_KIND_LABEL, libraryKindOk, previewMode, titleFromFilename } from "./library-kinds";
import { storeGlbPreview } from "./glb-convert";

export { LIBRARY_KINDS, LIBRARY_KIND_LABEL, libraryKindOk, previewMode } from "./library-kinds";
export { videoPosterPath } from "./file-thumb";
export type { LibraryKind } from "./library-kinds";

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
  ".mov": "video/quicktime",
  ".m4v": "video/mp4",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".blend": "application/x-blender",
  ".fbx": "model/fbx",
  ".obj": "model/obj",
  ".stl": "model/stl",
  ".abc": "application/octet-stream",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".wma": "audio/x-ms-wma",
  ".zip": "application/zip",
  ".rar": "application/vnd.rar",
  ".7z": "application/x-7z-compressed",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".csv": "text/csv",
  ".ods": "application/vnd.oasis.opendocument.spreadsheet",
  ".mkv": "video/x-matroska",
  ".avi": "video/x-msvideo",
};

const DOWNLOAD_ONLY_EXT = new Set([
  ".exe", ".bat", ".cmd", ".com", ".msi", ".dll", ".sh", ".ps1", ".js", ".mjs", ".cjs", ".vbs", ".scr", ".hta",
]);

export function canViewLibrary(user: SessionUser) {
  if (user.roleCode === "remote") return false;
  return userCan(user, "prod.work") || userCan(user, "prod.lead") || userCan(user, "prod.manage");
}

export function canManageLibrary(user: SessionUser) {
  return canLeadProd(user);
}

export type LibraryAclMaps = {
  parentOf: Map<string, string | null>;
  allow: Map<string, Set<string>>;
};

export async function loadLibraryAclMaps(): Promise<LibraryAclMaps> {
  const [items, acls] = await Promise.all([
    prisma.libraryItem.findMany({
      where: { deletedAt: null },
      select: { id: true, parentId: true },
    }),
    prisma.libraryAcl.findMany({ select: { itemId: true, userId: true } }),
  ]);
  const parentOf = new Map(items.map((i) => [i.id, i.parentId]));
  const allow = new Map<string, Set<string>>();
  for (const a of acls) {
    let set = allow.get(a.itemId);
    if (!set) {
      set = new Set();
      allow.set(a.itemId, set);
    }
    set.add(a.userId);
  }
  return { parentOf, allow };
}

export function canSeeLibraryNode(user: SessionUser, itemId: string, maps: LibraryAclMaps) {
  if (canManageLibrary(user)) return true;
  let cursor: string | null | undefined = itemId;
  const seen = new Set<string>();
  while (cursor) {
    if (seen.has(cursor)) return false;
    seen.add(cursor);
    if (!maps.parentOf.has(cursor)) return false;
    const allowed = maps.allow.get(cursor);
    if (allowed && allowed.size > 0 && !allowed.has(user.id)) return false;
    cursor = maps.parentOf.get(cursor) ?? null;
  }
  return true;
}

export async function libraryItemVisible(user: SessionUser, itemId: string) {
  if (!itemId) return true;
  if (canManageLibrary(user)) return true;
  const maps = await loadLibraryAclMaps();
  return canSeeLibraryNode(user, itemId, maps);
}

export async function assertLibraryVisible(user: SessionUser, itemId: string) {
  if (!(await libraryItemVisible(user, itemId))) {
    throw new Error("Нет доступа");
  }
}

export async function filterVisibleLibrary<T extends { id: string }>(user: SessionUser, rows: T[]) {
  if (canManageLibrary(user) || rows.length === 0) return rows;
  const maps = await loadLibraryAclMaps();
  return rows.filter((r) => canSeeLibraryNode(user, r.id, maps));
}

export async function getLibraryAcl(itemId: string) {
  const item = await prisma.libraryItem.findFirst({
    where: { id: itemId, deletedAt: null },
    select: { id: true, title: true, kind: true },
  });
  if (!item) throw new Error("Нет блока");
  const rows = await prisma.libraryAcl.findMany({ where: { itemId }, select: { userId: true } });
  return { item, userIds: rows.map((r) => r.userId), restricted: rows.length > 0 };
}

export async function listLibraryAclPeople() {
  const rows = await prisma.user.findMany({
    where: { deletedAt: null, status: "active", role: { code: { not: "remote" } } },
    select: {
      id: true,
      lastName: true,
      firstName: true,
      middleName: true,
      department: { select: { name: true } },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    name: [r.lastName, r.firstName, r.middleName].filter(Boolean).join(" ").trim(),
    dept: r.department?.name || "",
  }));
}

export async function setLibraryAcl(itemId: string, userIds: string[]) {
  const item = await prisma.libraryItem.findFirst({ where: { id: itemId, deletedAt: null } });
  if (!item) throw new Error("Нет блока");
  const unique = [...new Set(userIds.map(String).filter(Boolean))];
  const valid = unique.length
    ? await prisma.user.findMany({
        where: { id: { in: unique }, deletedAt: null },
        select: { id: true },
      })
    : [];
  const ids = valid.map((u) => u.id);
  await prisma.$transaction(async (tx) => {
    await tx.libraryAcl.deleteMany({ where: { itemId } });
    if (ids.length) {
      await tx.libraryAcl.createMany({ data: ids.map((userId) => ({ itemId, userId })) });
    }
  });
  return { restricted: ids.length > 0, userIds: ids, title: item.title };
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

function validateIncoming(file: IncomingFile, _kind: string, maxBytes: number) {
  if (file.buffer.length === 0) throw new Error(`Пустой файл: ${file.originalName}`);
  if (file.buffer.length > maxBytes) throw new Error(`Слишком большой: ${file.originalName}`);
  const ext = path.extname(file.originalName).toLowerCase();
  return EXT_MIME[ext] || file.mime || "application/octet-stream";
}

function downloadOnlyName(name: string) {
  return DOWNLOAD_ONLY_EXT.has(path.extname(name || "").toLowerCase());
}

export async function saveLibraryItem(opts: {
  user: SessionUser;
  title: string;
  kind: string;
  description: string;
  files: IncomingFile[];
  preview?: IncomingFile | null;
  maxBytes: number;
  parentId?: string;
}) {
  const incoming = opts.files.filter((f) => f.buffer.length > 0);
  if (incoming.length === 0) throw new Error("Приложите хотя бы один файл");
  const fromName = titleFromFilename(incoming[0].originalName);
  const title = opts.title.trim() || fromName || "файл";
  const description = opts.description.trim() || title;
  if (!libraryKindOk(opts.kind)) throw new Error("Выберите тип");
  let parentId: string | null = opts.parentId || null;
  if (parentId) {
    const parent = await prisma.libraryItem.findFirst({
      where: { id: parentId, deletedAt: null, kind: "folder" },
      select: { id: true },
    });
    if (!parent) throw new Error("Нет такой папки");
  }

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
    previewFileId: string;
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
    if (fileId) {
      const capturedId = fileId;
      const capturedBuf = file.buffer;
      const capturedName = file.originalName;
      void storeGlbPreview({
        buffer: capturedBuf,
        originalName: capturedName,
        userId: opts.user.id,
        maxBytes: opts.maxBytes,
      }).then((pid) => {
        if (!pid) return;
        return prisma.libraryFile.updateMany({ where: { fileId: capturedId }, data: { previewFileId: pid } });
      });
    }
    savedFiles.push({
      originalName: path.basename(file.originalName).slice(0, 200),
      mimeType: mime,
      size: file.buffer.length,
      fileId,
      previewFileId: "",
      absPath,
      uncPath: toUnc(absPath),
      sortOrder: i,
    });
  }

  const cover = savedFiles[0];
  return createLibraryRow({
    title,
    kind: opts.kind,
    description,
    parentId,
    userId: opts.user.id,
    previewFileId,
    packDir,
    savedFiles,
  });
}

async function copyPackFromPath(opts: { dir: string; originalName: string; source: string }) {
  const ext = path.extname(opts.originalName).toLowerCase() || "";
  const stem = safePart(path.basename(opts.originalName, ext));
  let name = `${stem}${ext}`;
  let n = 2;
  while (true) {
    const abs = path.join(/* turbopackIgnore: true */ opts.dir, name);
    try {
      await pipeline(
        createReadStream(/* turbopackIgnore: true */ opts.source),
        createWriteStream(/* turbopackIgnore: true */ abs, { flags: "wx" }),
      );
      return abs;
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code !== "EEXIST") throw e;
      name = `${stem}_${n}${ext}`;
      n += 1;
    }
  }
}

function createLibraryRow(opts: {
  title: string;
  kind: string;
  description: string;
  parentId: string | null;
  userId: string;
  previewFileId: string;
  packDir: string;
  savedFiles: {
    originalName: string;
    mimeType: string;
    size: number;
    fileId: string;
    previewFileId: string;
    absPath: string;
    uncPath: string;
    sortOrder: number;
  }[];
}) {
  const cover = opts.savedFiles[0];
  return prisma.libraryItem.create({
    data: {
      title: opts.title.slice(0, 200),
      kind: opts.kind,
      description: opts.description.slice(0, 2000),
      originalName: cover.originalName,
      mimeType: cover.mimeType,
      size: opts.savedFiles.reduce((s, f) => s + f.size, 0),
      fileId: cover.fileId,
      previewFileId: opts.previewFileId,
      absPath: opts.packDir,
      uncPath: toUnc(opts.packDir),
      authorId: opts.userId,
      parentId: opts.parentId,
      files: { create: opts.savedFiles },
    },
    include: { files: { orderBy: { sortOrder: "asc" } } },
  });
}

export async function saveLibraryItemFromDisk(opts: {
  user: SessionUser;
  title: string;
  kind: string;
  description: string;
  parentId?: string;
  originalName: string;
  mime: string;
  size: number;
  sourcePath: string;
  maxBytes: number;
}) {
  if (opts.size <= 0) throw new Error(`Пустой файл: ${opts.originalName}`);
  if (opts.size > opts.maxBytes) throw new Error("Файл слишком большой");
  const fromName = titleFromFilename(opts.originalName);
  const title = opts.title.trim() || fromName || "файл";
  const description = opts.description.trim() || title;
  if (!libraryKindOk(opts.kind)) throw new Error("Выберите тип");
  let parentId: string | null = opts.parentId || null;
  if (parentId) {
    const parent = await prisma.libraryItem.findFirst({
      where: { id: parentId, deletedAt: null, kind: "folder" },
      select: { id: true },
    });
    if (!parent) throw new Error("Нет такой папки");
  }
  const ext = path.extname(opts.originalName).toLowerCase();
  const mime = EXT_MIME[ext] || opts.mime || "application/octet-stream";
  const year = new Date().toISOString().slice(0, 4);
  const packDir = path.join(shareRoot(), "Library", opts.kind, year, `${safePart(title)}_${Date.now().toString(36)}`);
  await mkdir(/* turbopackIgnore: true */ packDir, { recursive: true });
  const absPath = await copyPackFromPath({ dir: packDir, originalName: opts.originalName, source: opts.sourcePath });
  const originalName = path.basename(opts.originalName).slice(0, 200);
  return createLibraryRow({
    title,
    kind: opts.kind,
    description,
    parentId,
    userId: opts.user.id,
    previewFileId: "",
    packDir,
    savedFiles: [
      {
        originalName,
        mimeType: mime,
        size: opts.size,
        fileId: "",
        previewFileId: "",
        absPath,
        uncPath: toUnc(absPath),
        sortOrder: 0,
      },
    ],
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

export async function libraryAbs(item: {
  fileId: string;
  absPath: string;
  originalName: string;
  mimeType: string;
}) {
  if (item.fileId) {
    const rec = await prisma.storedFile.findUnique({ where: { id: item.fileId } });
    if (rec) {
      return {
        abs: path.join(/* turbopackIgnore: true */ fileRoot(), rec.path),
        mime: rec.mimeType || item.mimeType || "application/octet-stream",
        name: rec.originalName || item.originalName || "file",
      };
    }
  }
  if (item.absPath) {
    return {
      abs: item.absPath,
      mime: item.mimeType || "application/octet-stream",
      name: item.originalName || "file",
    };
  }
  return null;
}

export async function serveLibraryFile(
  item: { fileId: string; absPath: string; originalName: string; mimeType: string },
  req: NextRequest,
  opts: { inline: boolean },
) {
  let abs = "";
  let mime = item.mimeType || "application/octet-stream";
  let name = item.originalName || "file";
  if (item.fileId) {
    const rec = await prisma.storedFile.findUnique({ where: { id: item.fileId } });
    if (rec) {
      abs = path.join(/* turbopackIgnore: true */ fileRoot(), rec.path);
      mime = rec.mimeType || mime;
      name = rec.originalName || name;
    }
  }
  if (!abs && item.absPath) abs = item.absPath;
  if (!abs) return null;
  const st = await stat(/* turbopackIgnore: true */ abs);
  const size = st.size;
  const range = req.headers.get("range");
  const forceDownload = downloadOnlyName(name);
  const disp = `${opts.inline && !forceDownload ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(name)}`;
  const common: Record<string, string> = {
    "Content-Type": forceDownload ? "application/octet-stream" : mime,
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
  previewFileId?: string;
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

function newShareToken() {
  return randomBytes(18).toString("base64url");
}

export async function listShareFolders(rootId: string) {
  const out: { id: string; title: string; parentId: string | null }[] = [];
  const walk = async (id: string, parentId: string | null) => {
    const row = await prisma.libraryItem.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, title: true, kind: true },
    });
    if (!row || row.kind !== "folder") return;
    out.push({ id: row.id, title: row.title, parentId });
    const kids = await prisma.libraryItem.findMany({
      where: { parentId: id, deletedAt: null, kind: "folder" },
      select: { id: true },
      orderBy: { title: "asc" },
    });
    for (const k of kids) await walk(k.id, row.id);
  };
  await walk(rootId, null);
  return out;
}

export async function listLibraryFolders(user?: SessionUser) {
  const rows = await prisma.libraryItem.findMany({
    where: { deletedAt: null, kind: "folder" },
    select: { id: true, title: true, parentId: true },
    orderBy: { title: "asc" },
  });
  if (!user) return rows;
  return filterVisibleLibrary(user, rows);
}

async function assertFolder(id: string | null) {
  if (!id) return null;
  const row = await prisma.libraryItem.findFirst({
    where: { id, deletedAt: null, kind: "folder" },
    select: { id: true, parentId: true },
  });
  if (!row) throw new Error("Нет такой папки");
  return row;
}

async function isUnder(nodeId: string, maybeAncestor: string) {
  let cursor = nodeId;
  const seen = new Set<string>();
  for (;;) {
    if (seen.has(cursor)) return false;
    seen.add(cursor);
    if (cursor === maybeAncestor) return true;
    const thisId = cursor;
    const row = await prisma.libraryItem.findUnique({
      where: { id: thisId },
      select: { parentId: true },
    });
    if (!row?.parentId) return false;
    cursor = row.parentId;
  }
}

export async function moveLibraryItems(ids: string[], destParentId: string | null) {
  const dest = await assertFolder(destParentId);
  const destId = dest?.id || null;
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) throw new Error("Ничего не выбрано");
  for (const id of unique) {
    if (destId && (id === destId || (await isUnder(destId, id)))) {
      throw new Error("Нельзя перенести папку саму в себя");
    }
    const row = await prisma.libraryItem.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
    if (!row) throw new Error("Нет объекта");
  }
  await prisma.libraryItem.updateMany({
    where: { id: { in: unique }, deletedAt: null },
    data: { parentId: destId },
  });
  return { ok: true, count: unique.length };
}

async function cloneItem(srcId: string, destParentId: string | null, userId: string, titleExtra = "") {
  const src = await prisma.libraryItem.findFirst({
    where: { id: srcId, deletedAt: null },
    include: { files: { orderBy: { sortOrder: "asc" } } },
  });
  if (!src) return;
  const title = `${src.title}${titleExtra}`.slice(0, 200);
  const created = await prisma.libraryItem.create({
    data: {
      title,
      kind: src.kind,
      description: src.description,
      originalName: src.originalName,
      mimeType: src.mimeType,
      size: src.size,
      fileId: src.fileId,
      previewFileId: src.previewFileId,
      absPath: src.absPath,
      uncPath: src.uncPath,
      parentId: destParentId,
      shareToken: "",
      shareEnabled: false,
      authorId: userId,
      files: {
        create: src.files.map((f, i) => ({
          originalName: f.originalName,
          mimeType: f.mimeType,
          size: f.size,
          fileId: f.fileId,
          previewFileId: f.previewFileId,
          absPath: f.absPath,
          uncPath: f.uncPath,
          sortOrder: f.sortOrder || i,
        })),
      },
    },
  });
  const acl = await prisma.libraryAcl.findMany({ where: { itemId: src.id }, select: { userId: true } });
  if (acl.length) {
    await prisma.libraryAcl.createMany({
      data: acl.map((a) => ({ itemId: created.id, userId: a.userId })),
    });
  }
  const kids = await prisma.libraryItem.findMany({
    where: { parentId: src.id, deletedAt: null },
    select: { id: true },
  });
  for (const k of kids) await cloneItem(k.id, created.id, userId);
}

export async function copyLibraryItems(ids: string[], destParentId: string | null, userId: string) {
  const dest = await assertFolder(destParentId);
  const destId = dest?.id || null;
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) throw new Error("Ничего не выбрано");
  for (const id of unique) {
    const row = await prisma.libraryItem.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, parentId: true },
    });
    if (!row) throw new Error("Нет объекта");
    const extra = (row.parentId || null) === destId ? " копия" : "";
    await cloneItem(id, destId, userId, extra);
  }
  return { ok: true, count: unique.length };
}

function zipSafe(name: string) {
  return (name || "file").replace(/\\/g, "/").replace(/\.\./g, "_").replace(/^\/+/, "").slice(0, 180) || "file";
}

type ZipStreamOpts = { onDone?: () => void; extraHeaders?: Record<string, string> };

export type LibraryZipArchive = {
  file: (abs: string, data: { name: string }) => unknown;
  append: (data: string | Buffer, opts: { name: string }) => unknown;
  finalize: () => Promise<void> | void;
  abort: () => void;
};

export async function libraryZipStream(filename: string, opts?: ZipStreamOpts) {
  const archiver = (await import("archiver")).default;
  const archive = archiver("zip", { zlib: { level: 1 } });
  const pass = new PassThrough();
  const abortFlag = { aborted: false };
  let finished = false;
  const done = () => {
    if (finished) return;
    finished = true;
    abortFlag.aborted = true;
    try {
      opts?.onDone?.();
    } catch {
      /* ignore cleanup */
    }
  };
  archive.on("error", (err: Error) => {
    if (!pass.destroyed && !abortFlag.aborted) {
      try {
        pass.destroy(err);
      } catch {
        /* already closed */
      }
    }
    done();
  });
  pass.on("error", () => done());
  pass.on("close", done);
  archive.pipe(pass);
  const safe = zipSafe(filename.replace(/\.zip$/i, "")) + ".zip";
  const response = new NextResponse(Readable.toWeb(pass) as unknown as ReadableStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(safe)}`,
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
      ...opts?.extraHeaders,
    },
  });
  return { archive: archive as unknown as LibraryZipArchive, pass, response, abortFlag };
}

export async function libraryZipResponse(
  filename: string,
  entries: { abs: string; name: string }[],
  opts?: ZipStreamOpts,
) {
  if (!entries.length) throw new Error("Нечего архивировать");
  const { archive, response } = await libraryZipStream(filename, opts);
  for (const e of entries) archive.file(e.abs, { name: e.name });
  void archive.finalize();
  return response;
}

export async function collectZipEntries(rootIds: string[], user?: SessionUser) {
  const entries: { abs: string; name: string }[] = [];
  const maps = user && !canManageLibrary(user) ? await loadLibraryAclMaps() : null;
  const walk = async (id: string, prefix: string) => {
    if (maps && user && !canSeeLibraryNode(user, id, maps)) return;
    const row = await prisma.libraryItem.findFirst({
      where: { id, deletedAt: null },
      include: { files: { orderBy: { sortOrder: "asc" } } },
    });
    if (!row) return;
    const here = prefix ? `${prefix}${zipSafe(row.title)}/` : row.kind === "folder" ? `${zipSafe(row.title)}/` : "";
    for (const f of packFiles(row)) {
      const loc = await libraryAbs(f);
      if (!loc) continue;
      const fileName = zipSafe(f.originalName);
      entries.push({ abs: loc.abs, name: `${here}${fileName}` });
    }
    const kids = await prisma.libraryItem.findMany({
      where: { parentId: id, deletedAt: null },
      select: { id: true },
      orderBy: { title: "asc" },
    });
    const childPrefix = row.kind === "folder" ? here : prefix;
    for (const k of kids) await walk(k.id, childPrefix);
  };
  for (const id of rootIds) await walk(id, "");
  return entries;
}

export async function renameLibraryFolder(id: string, title: string) {
  const name = title.trim().slice(0, 200);
  if (!name) throw new Error("Укажите название папки");
  const row = await prisma.libraryItem.findFirst({ where: { id, deletedAt: null, kind: "folder" } });
  if (!row) throw new Error("Нет такой папки");
  return prisma.libraryItem.update({ where: { id }, data: { title: name } });
}

export async function createLibraryFolder(opts: { userId: string; title: string; parentId?: string }) {
  const title = opts.title.trim().slice(0, 200);
  if (!title) throw new Error("Укажите название папки");
  let parentId: string | null = opts.parentId || null;
  if (parentId) {
    const parent = await prisma.libraryItem.findFirst({
      where: { id: parentId, deletedAt: null, kind: "folder" },
      select: { id: true },
    });
    if (!parent) throw new Error("Нет такой папки");
  }
  return prisma.libraryItem.create({
    data: {
      title,
      kind: "folder",
      description: "",
      authorId: opts.userId,
      parentId,
    },
  });
}

export async function setLibraryShare(
  itemId: string,
  opts: { enabled: boolean; download?: boolean; edit?: boolean; create?: boolean },
) {
  const item = await prisma.libraryItem.findFirst({ where: { id: itemId, deletedAt: null } });
  if (!item) throw new Error("Нет блока");
  const token = opts.enabled ? item.shareToken || newShareToken() : item.shareToken;
  return prisma.libraryItem.update({
    where: { id: itemId },
    data: {
      shareEnabled: opts.enabled,
      shareToken: token,
      shareDownload: opts.download ?? item.shareDownload,
      shareEdit: opts.edit ?? item.shareEdit,
      shareCreate: opts.create ?? item.shareCreate,
    },
  });
}

export async function findLibraryShare(token: string) {
  const t = token.trim();
  if (!t) return null;
  return prisma.libraryItem.findFirst({
    where: { shareToken: t, shareEnabled: true, deletedAt: null },
    include: { files: { orderBy: { sortOrder: "asc" } } },
  });
}

export async function assertInShare(rootId: string, itemId: string) {
  const browse = await shareBrowse(rootId, itemId);
  if (!browse) throw new Error("Нет доступа");
  return browse;
}

export async function collectShareFiles(rootId: string) {
  const out: { itemId: string; itemTitle: string; file: FileRow }[] = [];
  const walk = async (id: string, title: string) => {
    const row = await prisma.libraryItem.findFirst({
      where: { id, deletedAt: null },
      include: { files: { orderBy: { sortOrder: "asc" } } },
    });
    if (!row) return;
    for (const f of packFiles(row)) out.push({ itemId: row.id, itemTitle: row.title, file: f });
    const kids = await prisma.libraryItem.findMany({
      where: { parentId: id, deletedAt: null },
      select: { id: true, title: true },
      orderBy: { title: "asc" },
    });
    for (const k of kids) await walk(k.id, k.title);
  };
  const root = await prisma.libraryItem.findFirst({ where: { id: rootId, deletedAt: null }, select: { title: true } });
  await walk(rootId, root?.title || "");
  return out;
}

export async function shareBrowse(rootId: string, currentId: string) {
  const crumbs: { id: string; title: string; kind: string }[] = [];
  const seen = new Set<string>();
  let cursor = currentId;
  for (;;) {
    if (seen.has(cursor)) return null;
    seen.add(cursor);
    const row = await prisma.libraryItem.findUnique({
      where: { id: cursor },
      select: { id: true, title: true, kind: true, parentId: true, deletedAt: true },
    });
    if (!row || row.deletedAt) return null;
    crumbs.unshift({ id: row.id, title: row.title, kind: row.kind });
    if (row.id === rootId) break;
    if (!row.parentId) return null;
    cursor = row.parentId;
  }
  const current = await prisma.libraryItem.findFirst({
    where: { id: currentId, deletedAt: null },
    include: { files: { orderBy: { sortOrder: "asc" } } },
  });
  if (!current) return null;
  const children = await prisma.libraryItem.findMany({
    where: { parentId: currentId, deletedAt: null },
    include: { files: { orderBy: { sortOrder: "asc" } } },
    orderBy: [{ kind: "asc" }, { title: "asc" }],
  });
  children.sort((a, b) => Number(b.kind === "folder") - Number(a.kind === "folder") || a.title.localeCompare(b.title, "ru"));
  return { current, crumbs, children };
}

export async function libraryCrumbs(folderId: string | null) {
  const crumbs: { id: string; title: string }[] = [];
  let id = folderId;
  const seen = new Set<string>();
  while (id && !seen.has(id)) {
    seen.add(id);
    const row = await prisma.libraryItem.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, title: true, parentId: true },
    });
    if (!row) break;
    crumbs.unshift({ id: row.id, title: row.title });
    id = row.parentId;
  }
  return crumbs;
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
  shareEnabled?: boolean;
  shareToken?: string;
  shareDownload?: boolean;
  shareEdit?: boolean;
  shareCreate?: boolean;
  files?: FileRow[];
  author?: { lastName: string; firstName: string; middleName?: string | null } | null;
  _count?: { acl?: number };
  acl?: { userId: string }[];
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
    const preview = f.previewFileId ? "model3d" : previewMode(f);
    const fileUrl = `/api/library/${row.id}/file/${f.id}`;
    return {
      id: f.id,
      originalName: f.originalName,
      mimeType: f.mimeType,
      size: f.size,
      uncPath: f.uncPath,
      preview,
      fileUrl,
      previewUrl: f.previewFileId || preview === "model3d" ? `${fileUrl}${f.previewFileId ? "?preview=1" : ""}` : "",
      thumbUrl:
        preview === "image" || preview === "video" || preview === "pdf"
          ? `/api/library/${row.id}/file/${f.id}?poster=1`
          : "",
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
    thumbUrl:
      mode === "image" || mode === "video" || mode === "pdf" || row.previewFileId
        ? `/api/library/${row.id}/thumb`
        : "",
    fileUrl: serializedFiles[0]?.fileUrl || `/api/library/${row.id}/file`,
    href: row.kind === "folder" ? `/library?folder=${row.id}` : `/library/${row.id}`,
    isFolder: row.kind === "folder",
    shareEnabled: Boolean(row.shareEnabled),
    shareToken: row.shareEnabled ? row.shareToken || "" : "",
    shareDownload: row.shareDownload !== false,
    shareEdit: Boolean(row.shareEdit),
    shareCreate: Boolean(row.shareCreate),
    restricted: Boolean(row._count?.acl || row.acl?.length),
  };
}
