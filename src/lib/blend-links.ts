import { createHash } from "crypto";
import { createReadStream } from "fs";
import { mkdir, open, readFile, stat, writeFile } from "fs/promises";
import { spawn } from "child_process";
import path from "path";
import { Readable } from "stream";
import { createGunzip } from "zlib";
import { fileRoot } from "./files";
import { dataPageHref, dataViewHref } from "./share-data-href";
import { extOf, normalizeRel, parentRel, resolveData } from "./share-data";
import type { BlendLink, BlendLinkKind, BlendLinksInfo, BlendNote } from "./blend-links-types";

export type { BlendLink, BlendLinkKind, BlendLinksInfo, BlendNote } from "./blend-links-types";

const SCAN_MS = 90_000;
const MAX_PATHS = 400;
const MAX_ZIP_FILES = 60;
const MAX_ZIP_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_IMAGE_ZIP = 200 * 1024 * 1024;
const MARK_START = "<!-- videal-links:start -->";
const MARK_END = "<!-- videal-links:end -->";
const EXTS = "blend|exr|png|jpg|jpeg|tif|tiff|hdr|hdri|abc|vdb|mp4|wav|ogg|mp3|psd|tga|mov";
const PATH_RE = new RegExp(
  String.raw`(?:\\\\[^\x00-\x1f"]{6,420}|[A-Za-z]:\\[^\x00-\x1f"]{6,420}|//[^\x00-\x1f"]{3,420}|(?:^|[\s\x00])Data[\\/][^\x00-\x1f"]{3,420})\.(?:${EXTS})(?![A-Za-z0-9])`,
  "gi",
);
const SKIP_RE =
  /appdata|copybuffer|program files|steamapps|essentials_brushes|datafiles[/\\]assets|[\\/]temp[\\/]|[/\\]tmp[/\\]/i;
const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".tif", ".tiff", ".exr", ".hdr", ".hdri", ".tga", ".psd"]);

type CacheRow = {
  rel: string;
  size: number;
  mtimeMs: number;
  scannedAt: string;
  raw: string[];
};

export function isBlendName(name: string) {
  return /\.blend$/i.test(name || "");
}

function cacheDir() {
  return path.join(/* turbopackIgnore: true */ fileRoot(), "blend-links");
}

function cacheAbs(rel: string) {
  const id = createHash("sha1").update(rel).digest("hex");
  return path.join(/* turbopackIgnore: true */ cacheDir(), `${id}.json`);
}

function kindOfName(name: string, isDir: boolean): BlendLinkKind {
  if (isDir) return "dir";
  const ext = extOf(name);
  if (ext === ".blend") return "library";
  if (ext === ".md") return "note";
  if (IMAGE_EXT.has(ext)) return "image";
  return "file";
}

function sidecarRels(rel: string) {
  const name = rel.split("/").pop() || rel;
  const parent = parentRel(rel);
  const rows = [`${rel}.md`];
  if (/\.blend$/i.test(name)) {
    const stem = name.replace(/\.blend$/i, "");
    rows.push(parent ? `${parent}/${stem}.md` : `${stem}.md`);
  }
  return [...new Set(rows)];
}

function splitSidecar(text: string) {
  const start = text.indexOf(MARK_START);
  const end = text.indexOf(MARK_END);
  if (start >= 0 && end > start) {
    const notes = `${text.slice(0, start).trim()}\n${text.slice(end + MARK_END.length).trim()}`.trim();
    return { notes };
  }
  return { notes: text.trim() };
}

function resolveInsideData(raw: string) {
  const parts = raw
    .replace(/\\/g, "/")
    .split("/")
    .map((s) => s.trim())
    .filter((s) => s && s !== ".");
  const out: string[] = [];
  for (const p of parts) {
    if (p === "..") {
      if (!out.length) return "";
      out.pop();
      continue;
    }
    if (p.startsWith(".") || /[<>:"|?*\u0000]/.test(p)) return "";
    out.push(p);
  }
  return out.join("/");
}

export function toDataRel(raw: string, blendDir: string) {
  let s = String(raw || "").replace(/\0/g, "").trim();
  if (!s || SKIP_RE.test(s)) return "";
  s = s.replace(/\\/g, "/");
  const unc = s.match(/^\/\/[^/]+\/[dD]\/Data\/(.*)$/i);
  if (unc) s = unc[1];
  else if (/^\/\/[^/]+\/[dD]\//i.test(s)) return "";
  else {
    const drive = s.match(/^[A-Za-z]:\/Data\/(.*)$/i);
    if (drive) s = drive[1];
    else if (/^[A-Za-z]:\//.test(s)) return "";
    else if (/^\/srv\/samba\/share\/Data\//i.test(s)) s = s.replace(/^\/srv\/samba\/share\/Data\//i, "");
    else if (/^\/+Data\//i.test(s)) s = s.replace(/^\/+Data\//i, "");
    else if (/^Data\//i.test(s)) s = s.slice(5);
    else if (s.startsWith("//")) {
      s = resolveInsideData(`${blendDir}/${s.slice(2)}`);
    }
  }
  s = s.replace(/^\/+/, "");
  if (!s || /^[A-Za-z]:/.test(s) || s.startsWith("//") || SKIP_RE.test(s)) return "";
  try {
    return normalizeRel(resolveInsideData(s));
  } catch {
    return "";
  }
}

async function readHead(abs: string, n: number) {
  const fh = await open(/* turbopackIgnore: true */ abs, "r");
  try {
    const buf = Buffer.alloc(n);
    const { bytesRead } = await fh.read(buf, 0, n, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}

function collectPaths(chunk: string, found: string[], seen: Set<string>) {
  PATH_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PATH_RE.exec(chunk))) {
    let s = m[0].replace(/^[\s\x00]+/, "").replace(/\0/g, "").trim();
    if (s.length < 8 || s.length > 420 || s.includes("\uFFFD")) continue;
    if (seen.has(s) || SKIP_RE.test(s)) continue;
    seen.add(s);
    found.push(s);
    if (found.length >= MAX_PATHS) break;
  }
}

function scanReadable(stream: Readable, timeoutMs: number, child?: { kill: (sig?: NodeJS.Signals) => void }) {
  return new Promise<string[]>((resolve, reject) => {
    const found: string[] = [];
    const seen = new Set<string>();
    let carry = "";
    let done = false;
    const timer = setTimeout(() => {
      finish(new Error("Разбор .blend слишком долгий"));
      child?.kill("SIGKILL");
      stream.destroy();
    }, timeoutMs);
    const finish = (err?: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (err) reject(err);
      else resolve(found);
    };
    stream.on("data", (buf: Buffer) => {
      const text = carry + buf.toString("utf8");
      collectPaths(text, found, seen);
      carry = text.slice(-800);
      if (found.length >= MAX_PATHS) {
        stream.destroy();
        finish();
      }
    });
    stream.on("end", () => finish());
    stream.on("error", (e) => finish(e));
  });
}

async function scanBlendFile(abs: string) {
  const head = await readHead(abs, 16);
  if (head.length >= 4 && head[0] === 0x28 && head[1] === 0xb5 && head[2] === 0x2f && head[3] === 0xfd) {
    const child = spawn("zstd", ["-d", "-c", abs], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, DISPLAY: "" },
    });
    const errChunks: Buffer[] = [];
    child.stderr?.on("data", (d) => {
      errChunks.push(Buffer.from(d));
    });
    child.on("error", (e) => {
      child.stdout?.destroy(e);
    });
    try {
      if (!child.stdout) throw new Error("zstd не отдал поток");
      return await scanReadable(child.stdout, SCAN_MS, child);
    } catch (e) {
      const msg = Buffer.concat(errChunks).toString("utf8").slice(0, 200);
      throw e instanceof Error && msg ? new Error(`${e.message}: ${msg}`) : e;
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    }
  }
  if (head.length >= 2 && head[0] === 0x1f && head[1] === 0x8b) {
    const stream = createReadStream(/* turbopackIgnore: true */ abs).pipe(createGunzip());
    return await scanReadable(stream, SCAN_MS);
  }
  return await scanReadable(createReadStream(/* turbopackIgnore: true */ abs), SCAN_MS);
}

async function readCache(rel: string, size: number, mtimeMs: number): Promise<CacheRow | null> {
  try {
    const raw = JSON.parse(await readFile(/* turbopackIgnore: true */ cacheAbs(rel), "utf8")) as CacheRow;
    if (raw && raw.rel === rel && raw.size === size && raw.mtimeMs === mtimeMs && Array.isArray(raw.raw)) return raw;
  } catch {
    return null;
  }
  return null;
}

async function writeCache(row: CacheRow) {
  await mkdir(/* turbopackIgnore: true */ cacheDir(), { recursive: true });
  await writeFile(/* turbopackIgnore: true */ cacheAbs(row.rel), JSON.stringify(row), "utf8");
}

export async function readBlendNotes(rel: string): Promise<BlendNote[]> {
  const notes: BlendNote[] = [];
  const seen = new Set<string>();
  for (const side of sidecarRels(rel)) {
    if (seen.has(side)) continue;
    seen.add(side);
    try {
      const { abs } = await resolveData(side, { exist: true });
      const st = await stat(/* turbopackIgnore: true */ abs);
      if (st.isDirectory() || st.size > 400_000) continue;
      const text = await readFile(/* turbopackIgnore: true */ abs, "utf8");
      const { notes: body } = splitSidecar(text);
      if (!body) continue;
      notes.push({ rel: side, name: side.split("/").pop() || side, text: body.slice(0, 20_000) });
    } catch {
      continue;
    }
  }
  return notes;
}

async function statLink(rel: string, kindHint?: BlendLinkKind): Promise<BlendLink> {
  const name = rel.split("/").pop() || rel;
  try {
    const { abs } = await resolveData(rel, { exist: true });
    const st = await stat(/* turbopackIgnore: true */ abs);
    const kind = kindOfName(name, st.isDirectory());
    return { rel, name, kind: kindHint && !st.isDirectory() ? kindHint : kind, exists: true, size: st.isDirectory() ? 0 : st.size };
  } catch {
    return { rel, name, kind: kindHint || kindOfName(name, false), exists: false, size: 0 };
  }
}

function buildLinks(rel: string, raws: string[]): Promise<BlendLink[]> {
  const blendDir = parentRel(rel);
  const mapped = new Map<string, BlendLinkKind>();
  for (const raw of raws) {
    const next = toDataRel(raw, blendDir);
    if (!next || next === rel) continue;
    const kind = kindOfName(next.split("/").pop() || next, false);
    const prev = mapped.get(next);
    if (!prev || (kind === "library" && prev !== "library")) mapped.set(next, kind);
  }
  const libs = [...mapped.entries()].filter(([, k]) => k === "library").map(([p]) => p);
  for (const lib of libs) {
    const dir = parentRel(lib);
    if (dir && dir !== blendDir && !mapped.has(dir)) mapped.set(dir, "dir");
  }
  return Promise.all([...mapped.entries()].map(([p, k]) => statLink(p, k)));
}

function sortLinks(rows: BlendLink[]) {
  const rank: Record<BlendLinkKind, number> = { library: 0, dir: 1, image: 2, file: 3, note: 4 };
  return rows.sort((a, b) => {
    if (a.exists !== b.exists) return a.exists ? -1 : 1;
    const d = rank[a.kind] - rank[b.kind];
    if (d) return d;
    return a.rel.localeCompare(b.rel, "ru");
  });
}

function sidecarBody(rel: string, links: BlendLink[]) {
  const name = rel.split("/").pop() || rel;
  const groups: { title: string; kind: BlendLinkKind }[] = [
    { title: "Link / Append", kind: "library" },
    { title: "Папки", kind: "dir" },
    { title: "Текстуры и файлы", kind: "image" },
  ];
  const lines = [
    MARK_START,
    `# ${name}`,
    "",
    "Связанные файлы из Link / Append. Скачать пакетом: с сайта, кнопка «Скачать всё связанное».",
    "",
  ];
  for (const g of groups) {
    const rows = links.filter((l) => (g.kind === "image" ? l.kind === "image" || l.kind === "file" : l.kind === g.kind));
    if (!rows.length) continue;
    lines.push(`## ${g.title}`, "");
    for (const l of rows) {
      const href = l.kind === "dir" ? dataPageHref(l.rel) : dataViewHref(l.rel);
      const mark = l.exists ? "" : " *(нет на диске)*";
      lines.push(`- [${l.rel}](${href})${mark}`);
    }
    lines.push("");
  }
  lines.push(MARK_END, "");
  return lines.join("\n");
}

async function writeSidecarMd(rel: string, links: BlendLink[]) {
  const side = `${rel}.md`;
  const dest = await resolveData(side);
  let prev = "";
  try {
    prev = await readFile(/* turbopackIgnore: true */ dest.abs, "utf8");
  } catch {
    prev = "";
  }
  const { notes } = splitSidecar(prev);
  const body = sidecarBody(rel, links);
  const next = notes ? `${body}\n${notes}\n` : body;
  if (next === prev) return side;
  await mkdir(/* turbopackIgnore: true */ path.dirname(dest.abs), { recursive: true });
  await writeFile(/* turbopackIgnore: true */ dest.abs, next, "utf8");
  return side;
}

export function zipPlan(source: BlendLink, links: BlendLink[]) {
  const picked: BlendLink[] = [];
  let bytes = 0;
  const add = (row: BlendLink) => {
    if (!row.exists || row.kind === "dir") return;
    if (picked.some((x) => x.rel === row.rel)) return;
    if (row.kind === "image" && row.size > MAX_IMAGE_ZIP) return;
    if (picked.length >= MAX_ZIP_FILES) return;
    if (bytes + row.size > MAX_ZIP_BYTES) return;
    picked.push(row);
    bytes += row.size;
  };
  add(source);
  for (const row of links.filter((l) => l.kind === "note")) add(row);
  for (const row of links.filter((l) => l.kind === "library")) add(row);
  for (const row of links.filter((l) => l.kind === "file" || l.kind === "image")) add(row);
  const wanted = (source.exists ? 1 : 0) + links.filter((l) => l.exists && l.kind !== "dir" && l.rel !== source.rel).length;
  return { picked, bytes, capped: picked.length < wanted || picked.length >= MAX_ZIP_FILES };
}

async function infoFromRaw(rel: string, raw: string[], scannedAt: string, writeSidecar: boolean): Promise<BlendLinksInfo> {
  const links = sortLinks(await buildLinks(rel, raw));
  if (writeSidecar) {
    try {
      const side = await writeSidecarMd(rel, links);
      if (!links.some((l) => l.rel === side)) {
        links.unshift(await statLink(side, "note"));
      }
    } catch {
      /* share may be read-only */
    }
  }
  const notes = await readBlendNotes(rel);
  const source = await statLink(rel, "library");
  const zip = zipPlan(source, links);
  return {
    rel,
    scannedAt,
    links,
    notes,
    zipCount: zip.picked.length,
    zipBytes: zip.bytes,
    zipCapped: zip.capped,
  };
}

export async function peekBlendLinks(rel: string): Promise<BlendLinksInfo | null> {
  try {
    const { abs } = await resolveData(rel, { exist: true });
    const st = await stat(/* turbopackIgnore: true */ abs);
    const cache = await readCache(rel, st.size, st.mtimeMs);
    if (!cache) return null;
    return await infoFromRaw(rel, cache.raw, cache.scannedAt, false);
  } catch {
    return null;
  }
}

const inflight = new Map<string, Promise<BlendLinksInfo>>();

export async function loadBlendLinks(rel: string, opts?: { refresh?: boolean; writeSidecar?: boolean }): Promise<BlendLinksInfo> {
  const { abs } = await resolveData(rel, { exist: true });
  const st = await stat(/* turbopackIgnore: true */ abs);
  if (st.isDirectory()) throw new Error("Это папка");
  const name = rel.split("/").pop() || rel;
  if (!isBlendName(name)) {
    const notes = await readBlendNotes(rel);
    return { rel, scannedAt: new Date().toISOString(), links: [], notes };
  }
  if (!opts?.refresh) {
    const pending = inflight.get(rel);
    if (pending) return pending;
  }
  const job = (async () => {
    if (!opts?.refresh) {
      const cache = await readCache(rel, st.size, st.mtimeMs);
      if (cache) return await infoFromRaw(rel, cache.raw, cache.scannedAt, false);
    }
    const raw = await scanBlendFile(abs);
    const scannedAt = new Date().toISOString();
    await writeCache({ rel, size: st.size, mtimeMs: st.mtimeMs, scannedAt, raw });
    return await infoFromRaw(rel, raw, scannedAt, Boolean(opts?.writeSidecar));
  })();
  inflight.set(rel, job);
  try {
    return await job;
  } finally {
    if (inflight.get(rel) === job) inflight.delete(rel);
  }
}

export async function planRelatedZip(rel: string) {
  const info = await loadBlendLinks(rel, { writeSidecar: false });
  const source = await statLink(rel, "library");
  const { picked, capped } = zipPlan(source, info.links);
  const files: { rel: string; abs: string }[] = [];
  let bytes = 0;
  for (const row of picked) {
    try {
      const loc = await resolveData(row.rel, { exist: true });
      const st = await stat(/* turbopackIgnore: true */ loc.abs);
      if (st.isDirectory()) continue;
      files.push({ rel: row.rel, abs: loc.abs });
      bytes += st.size;
    } catch {
      continue;
    }
  }
  if (!files.length) throw new Error("Нечего архивировать");
  return {
    files,
    capped,
    bytes,
    name: (rel.split("/").pop() || "blend").replace(/\.blend$/i, "") + "-связанное",
  };
}

export async function collectRelatedZipEntries(rel: string) {
  const plan = await planRelatedZip(rel);
  const { buildRelatedZipEntries } = await import("./blend-remap");
  const packed = await buildRelatedZipEntries(rel, plan.files);
  return {
    entries: packed.entries,
    tmp: packed.tmp,
    capped: plan.capped,
    name: plan.name,
  };
}
