import { constants, createReadStream } from "fs";
import { copyFile, cp, link, mkdir, readdir, readFile, realpath, rename, rm, stat, writeFile } from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { NextRequest, NextResponse } from "next/server";
import { assertInside } from "./files";
import { previewMode } from "./library-kinds";
import { shareRoot } from "./prod";
import { userCan, type SessionUser } from "./types";
import type { DataEntry, TrashEntry } from "./share-data-href";

export type { DataEntry, TrashEntry } from "./share-data-href";
export { dataFileUrl, dataPageHref, dataViewHref } from "./share-data-href";

const TRASH_DIR = ".vd-trash";

const BLOCKED = new Set([".exe", ".bat", ".cmd", ".com", ".msi", ".dll", ".sh", ".ps1", ".js", ".vbs", ".scr"]);

const MIME: Record<string, string> = {
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
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".blend": "application/x-blender",
  ".fbx": "model/fbx",
  ".obj": "model/obj",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".zip": "application/zip",
  ".txt": "text/plain",
  ".md": "text/markdown",
};

export function canViewData(user: SessionUser) {
  return userCan(user, "data.view");
}

export function canWorkData(user: SessionUser) {
  return userCan(user, "data.work");
}

export function dataRoot() {
  return path.resolve(/* turbopackIgnore: true */ shareRoot(), "Data");
}

export function extOf(name: string) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

export function mimeOf(name: string) {
  return MIME[extOf(name)] || "application/octet-stream";
}

export function blockedName(name: string) {
  return BLOCKED.has(extOf(name));
}

export function normalizeRel(raw: string) {
  const parts = String(raw || "")
    .replace(/\\/g, "/")
    .split("/")
    .map((s) => s.trim())
    .filter((s) => s && s !== ".");
  if (parts[0]?.toLowerCase() === "data") parts.shift();
  if (parts.some((s) => s === ".." || s.startsWith(".") || /[<>:"|?*\u0000]/.test(s))) {
    throw new Error("Некорректный путь");
  }
  return parts.join("/");
}

export function trashRoot() {
  return path.join(/* turbopackIgnore: true */ dataRoot(), TRASH_DIR);
}

function trashIdOk(id: string) {
  return /^t[a-z0-9]{8,32}$/.test(id);
}

function keepDiskName(name: string) {
  const base = path.basename(name || "");
  if (!base || base === "." || base === ".." || /[<>:"/\\|?*\u0000]/.test(base)) {
    throw new Error("Пустое имя");
  }
  return base.slice(0, 180);
}

async function movePath(from: string, to: string) {
  await mkdir(/* turbopackIgnore: true */ path.dirname(to), { recursive: true });
  try {
    await rename(/* turbopackIgnore: true */ from, to);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EXDEV") throw e;
    const st = await stat(/* turbopackIgnore: true */ from);
    if (st.isDirectory()) {
      await cp(/* turbopackIgnore: true */ from, to, { recursive: true });
      await rm(/* turbopackIgnore: true */ from, { recursive: true, force: true });
    } else {
      await copyFile(/* turbopackIgnore: true */ from, to);
      await rm(/* turbopackIgnore: true */ from, { force: true });
    }
  }
}

async function uniqueLiveRel(rel: string) {
  const { abs } = await resolveData(rel);
  try {
    await stat(/* turbopackIgnore: true */ abs);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return rel;
    throw e;
  }
  const parent = parentRel(rel);
  const name = rel.split("/").pop() || "файл";
  const ext = extOf(name);
  const stem = ext ? name.slice(0, -ext.length) : name;
  for (let i = 1; i < 40; i++) {
    const nextName = i === 1 ? `${stem} восстановлено${ext}` : `${stem} восстановлено ${i}${ext}`;
    const cand = joinRel(parent, nextName);
    const dest = await resolveData(cand);
    try {
      await stat(/* turbopackIgnore: true */ dest.abs);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return cand;
      throw e;
    }
  }
  throw new Error("Некуда восстановить: имя занято");
}

export function safeDataName(name: string) {
  const base = path
    .basename(name || "")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/\.\./g, "_")
    .replace(/^\.+/, "")
    .trim();
  if (!base) throw new Error("Пустое имя");
  return base.slice(0, 180);
}

export function parentRel(rel: string) {
  const n = normalizeRel(rel);
  const i = n.lastIndexOf("/");
  return i >= 0 ? n.slice(0, i) : "";
}

export function joinRel(dir: string, name: string) {
  const a = normalizeRel(dir);
  const b = safeDataName(name);
  return a ? `${a}/${b}` : b;
}

export async function resolveData(rel: string, opts?: { exist?: boolean }) {
  const root = dataRoot();
  await mkdir(/* turbopackIgnore: true */ root, { recursive: true });
  const clean = normalizeRel(rel);
  const abs = assertInside(root, path.join(/* turbopackIgnore: true */ root, ...clean.split("/").filter(Boolean)));
  if (opts?.exist) {
    const real = await realpath(/* turbopackIgnore: true */ abs);
    return { abs: assertInside(root, real), rel: clean, root };
  }
  return { abs, rel: clean, root };
}

export async function listData(rel: string) {
  const { abs, rel: clean } = await resolveData(rel, { exist: true });
  const st = await stat(/* turbopackIgnore: true */ abs);
  if (!st.isDirectory()) throw new Error("Это не папка");
  const rows = await readdir(/* turbopackIgnore: true */ abs, { withFileTypes: true });
  const visible = rows.filter((row) => !row.name.startsWith("."));
  const entries: DataEntry[] = [];
  const limit = 16;
  let cursor = 0;
  async function worker() {
    while (cursor < visible.length) {
      const row = visible[cursor];
      cursor += 1;
      const childRel = clean ? `${clean}/${row.name}` : row.name;
      let size = 0;
      let isDir = row.isDirectory();
      try {
        const info = await stat(/* turbopackIgnore: true */ path.join(abs, row.name));
        isDir = info.isDirectory();
        size = isDir ? 0 : info.size;
      } catch {
        continue;
      }
      const mime = isDir ? "" : mimeOf(row.name);
      entries.push({
        name: row.name,
        rel: childRel,
        isDir,
        size,
        mime,
        preview: isDir ? "none" : previewMode({ mimeType: mime, originalName: row.name }),
      });
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, visible.length) }, () => worker()));
  entries.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name, "ru", { sensitivity: "base" });
  });
  const crumbs = clean
    ? clean.split("/").map((name, i, all) => ({ name, rel: all.slice(0, i + 1).join("/") }))
    : [];
  return { rel: clean, crumbs, entries: entries.slice(0, 2000) };
}

export async function mkdirData(dir: string, name: string) {
  const rel = joinRel(dir, name);
  const { abs } = await resolveData(rel);
  await mkdir(/* turbopackIgnore: true */ abs, { recursive: true });
  return rel;
}

export async function renameData(rel: string, name: string) {
  const from = await resolveData(rel, { exist: true });
  const destRel = joinRel(parentRel(from.rel), name);
  if (destRel === from.rel) return destRel;
  const dest = await resolveData(destRel);
  await rename(/* turbopackIgnore: true */ from.abs, dest.abs);
  return destRel;
}

function isUnderRel(child: string, ancestor: string) {
  const c = normalizeRel(child);
  const a = normalizeRel(ancestor);
  if (!a) return false;
  return c === a || c.startsWith(`${a}/`);
}

async function uniqueCopyRel(destDir: string, name: string) {
  const first = joinRel(destDir, name);
  try {
    await stat(/* turbopackIgnore: true */ (await resolveData(first)).abs);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return first;
    throw e;
  }
  const ext = extOf(name);
  const stem = ext ? name.slice(0, -ext.length) : name;
  for (let i = 1; i < 40; i++) {
    const nextName = i === 1 ? `${stem} копия${ext}` : `${stem} копия ${i}${ext}`;
    const cand = joinRel(destDir, nextName);
    try {
      await stat(/* turbopackIgnore: true */ (await resolveData(cand)).abs);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return cand;
      throw e;
    }
  }
  throw new Error("Некуда копировать: имя занято");
}

async function assertDestFolder(destDir: string) {
  const dest = await resolveData(destDir, { exist: true });
  const st = await stat(/* turbopackIgnore: true */ dest.abs);
  if (!st.isDirectory()) throw new Error("Куда класть — это не папка");
  return dest;
}

const COPY_MAX_BYTES = 20 * 1024 * 1024 * 1024;
export const DATA_BATCH_MAX = 50;

async function assertCopyBudget(abs: string) {
  let total = 0;
  async function walk(p: string) {
    const st = await stat(/* turbopackIgnore: true */ p);
    if (st.isFile()) {
      total += st.size;
      if (total > COPY_MAX_BYTES) throw new Error("Слишком большой объект для копирования (больше 20 ГБ)");
      return;
    }
    if (!st.isDirectory()) return;
    const rows = await readdir(/* turbopackIgnore: true */ p);
    for (const name of rows) {
      if (name.startsWith(".")) continue;
      await walk(path.join(/* turbopackIgnore: true */ p, name));
    }
  }
  await walk(abs);
}

async function copyExclusive(fromAbs: string, destAbs: string, isDir: boolean) {
  if (isDir) {
    await cp(/* turbopackIgnore: true */ fromAbs, destAbs, { recursive: true, errorOnExist: true, force: false });
    return;
  }
  await copyFile(/* turbopackIgnore: true */ fromAbs, destAbs, constants.COPYFILE_EXCL);
}

function existsError(e: unknown) {
  return (e as NodeJS.ErrnoException).code === "EEXIST";
}

export async function moveData(srcRel: string, destDir: string) {
  const from = await resolveData(srcRel, { exist: true });
  if (!from.rel) throw new Error("Нельзя переместить корень Data");
  const destFolder = await assertDestFolder(destDir);
  if (from.rel === destFolder.rel) throw new Error("Нельзя переместить папку саму в себя");
  if (isUnderRel(destFolder.rel, from.rel)) throw new Error("Нельзя переместить папку внутрь себя");
  if (parentRel(from.rel) === destFolder.rel) return from.rel;
  const name = from.rel.split("/").pop() || from.rel;
  const destRel = joinRel(destFolder.rel, name);
  const dest = await resolveData(destRel);
  const st = await stat(/* turbopackIgnore: true */ from.abs);
  const taken = () => new Error(`Там уже есть «${name}»`);
  if (!st.isDirectory()) {
    try {
      await link(/* turbopackIgnore: true */ from.abs, dest.abs);
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === "EEXIST") throw taken();
      if (code !== "EXDEV" && code !== "EPERM" && code !== "ENOTSUP" && code !== "EOPNOTSUPP") throw e;
      try {
        await copyFile(/* turbopackIgnore: true */ from.abs, dest.abs, constants.COPYFILE_EXCL);
      } catch (e2) {
        if (existsError(e2)) throw taken();
        throw e2;
      }
    }
    await rm(/* turbopackIgnore: true */ from.abs, { force: true });
    return destRel;
  }
  try {
    await mkdir(/* turbopackIgnore: true */ dest.abs);
  } catch (e) {
    if (existsError(e)) throw taken();
    throw e;
  }
  await rm(/* turbopackIgnore: true */ dest.abs);
  try {
    await rename(/* turbopackIgnore: true */ from.abs, dest.abs);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EXDEV") throw e;
    await cp(/* turbopackIgnore: true */ from.abs, dest.abs, { recursive: true, errorOnExist: true, force: false });
    await rm(/* turbopackIgnore: true */ from.abs, { recursive: true, force: true });
  }
  return destRel;
}

export async function copyData(srcRel: string, destDir: string) {
  const from = await resolveData(srcRel, { exist: true });
  if (!from.rel) throw new Error("Нельзя копировать корень Data");
  const destFolder = await assertDestFolder(destDir);
  if (from.rel === destFolder.rel) throw new Error("Нельзя копировать папку саму в себя");
  if (isUnderRel(destFolder.rel, from.rel)) throw new Error("Нельзя копировать папку внутрь себя");
  const name = from.rel.split("/").pop() || from.rel;
  const st = await stat(/* turbopackIgnore: true */ from.abs);
  await assertCopyBudget(from.abs);
  for (let i = 0; i < 40; i++) {
    const destRel = await uniqueCopyRel(destFolder.rel, name);
    const dest = await resolveData(destRel);
    try {
      await copyExclusive(from.abs, dest.abs, st.isDirectory());
      return destRel;
    } catch (e) {
      if (!existsError(e)) throw e;
    }
  }
  throw new Error("Некуда копировать: имя занято");
}

export async function listDataFolders(rel: string) {
  const listed = await listData(rel);
  return {
    rel: listed.rel,
    crumbs: listed.crumbs,
    folders: listed.entries.filter((e) => e.isDir).map((e) => ({ name: e.name, rel: e.rel })),
  };
}

type TrashMeta = { id: string; name: string; rel: string; isDir: boolean; deletedAt: string; size: number };

async function trashBin(id: string) {
  if (!trashIdOk(id)) throw new Error("Некорректный путь");
  const root = trashRoot();
  await mkdir(/* turbopackIgnore: true */ root, { recursive: true });
  return assertInside(root, path.join(/* turbopackIgnore: true */ root, id));
}

async function readTrashMeta(id: string): Promise<{ meta: TrashMeta; itemAbs: string; bin: string }> {
  const bin = await trashBin(id);
  const metaAbs = assertInside(bin, path.join(bin, "meta.json"));
  const raw = JSON.parse(await readFile(/* turbopackIgnore: true */ metaAbs, "utf8")) as TrashMeta;
  if (!raw || raw.id !== id || !raw.name || !raw.rel) throw new Error("Нет записи в корзине");
  const itemAbs = assertInside(bin, path.join(bin, keepDiskName(raw.name)));
  return { meta: raw, itemAbs, bin };
}

export async function moveToTrash(rel: string) {
  const from = await resolveData(rel, { exist: true });
  if (!from.rel) throw new Error("Нельзя удалить корень Data");
  const st = await stat(/* turbopackIgnore: true */ from.abs);
  const name = keepDiskName(from.rel.split("/").pop() || from.rel);
  const id = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const bin = await trashBin(id);
  await mkdir(/* turbopackIgnore: true */ bin, { recursive: true });
  const itemAbs = assertInside(bin, path.join(bin, name));
  await movePath(from.abs, itemAbs);
  const meta: TrashMeta = {
    id,
    name,
    rel: from.rel,
    isDir: st.isDirectory(),
    deletedAt: new Date().toISOString(),
    size: st.isDirectory() ? 0 : st.size,
  };
  await writeFile(/* turbopackIgnore: true */ path.join(bin, "meta.json"), JSON.stringify(meta), "utf8");
  return meta;
}

export async function listTrash() {
  const root = trashRoot();
  await mkdir(/* turbopackIgnore: true */ root, { recursive: true });
  const rows = await readdir(/* turbopackIgnore: true */ root, { withFileTypes: true });
  const entries: TrashEntry[] = [];
  for (const row of rows) {
    if (!row.isDirectory() || !trashIdOk(row.name)) continue;
    try {
      const { meta } = await readTrashMeta(row.name);
      const mime = meta.isDir ? "" : mimeOf(meta.name);
      entries.push({
        id: meta.id,
        name: meta.name,
        rel: meta.rel,
        isDir: meta.isDir,
        size: meta.size,
        mime,
        preview: meta.isDir ? "none" : previewMode({ mimeType: mime, originalName: meta.name }),
        deletedAt: meta.deletedAt,
      });
    } catch {
      continue;
    }
  }
  entries.sort((a, b) => (a.deletedAt < b.deletedAt ? 1 : -1));
  return entries.slice(0, 2000);
}

export async function restoreTrash(id: string) {
  const { meta, itemAbs, bin } = await readTrashMeta(id);
  await stat(/* turbopackIgnore: true */ itemAbs);
  const destRel = await uniqueLiveRel(normalizeRel(meta.rel));
  const dest = await resolveData(destRel);
  await movePath(itemAbs, dest.abs);
  await rm(/* turbopackIgnore: true */ bin, { recursive: true, force: true });
  return destRel;
}

export async function placeUpload(dir: string, name: string, srcAbs: string) {
  if (blockedName(name)) throw new Error("Этот тип нельзя загрузить");
  const rel = joinRel(dir, name);
  const dest = await resolveData(rel);
  await mkdir(/* turbopackIgnore: true */ path.dirname(dest.abs), { recursive: true });
  try {
    const st = await stat(/* turbopackIgnore: true */ dest.abs);
    if (st.isDirectory()) throw new Error("Там уже папка с таким именем");
    await rm(/* turbopackIgnore: true */ dest.abs, { force: true });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  try {
    await rename(/* turbopackIgnore: true */ srcAbs, dest.abs);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EXDEV") throw e;
    await copyFile(/* turbopackIgnore: true */ srcAbs, dest.abs);
    await rm(/* turbopackIgnore: true */ srcAbs, { force: true });
  }
  return rel;
}

export async function serveDataFile(rel: string, req: NextRequest, opts: { inline: boolean }) {
  const { abs } = await resolveData(rel, { exist: true });
  const st = await stat(/* turbopackIgnore: true */ abs);
  if (st.isDirectory()) return null;
  const name = path.basename(abs);
  const mime = mimeOf(name);
  const size = st.size;
  const range = req.headers.get("range");
  const disp = `${opts.inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(name)}`;
  const common: Record<string, string> = {
    "Content-Type": mime,
    "Content-Disposition": disp,
    "Cache-Control": "private, max-age=120",
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

