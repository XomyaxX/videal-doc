import { createReadStream, createWriteStream } from "fs";
import { copyFile, mkdir, mkdtemp, open, readdir, readFile, rm, stat, writeFile } from "fs/promises";
import { spawn } from "child_process";
import path from "path";
import { pipeline } from "stream/promises";
import { createGunzip, createGzip } from "zlib";
import { assertInside, fileRoot } from "./files";
import { toUnc } from "./prod";
import { dataRoot, normalizeRel, parentRel, placeUpload } from "./share-data";

function isBlendName(name: string) {
  return /\.blend$/i.test(name || "");
}

export type BlendReplacement = { from: string; to: string; count: number };
export type BlendRemapEntry = { rel: string; replacements: BlendReplacement[]; skipped: number };
export type RelatedManifest = {
  version: 1;
  root: string;
  uncPrefix: string;
  files: string[];
  blends: BlendRemapEntry[];
};

type Codec = "zstd" | "gzip" | "raw";

const HOSTS = ["WIN-IG5P3PA35H3", "Win-ig5p3pa35h3", "win-ig5p3pa35h3"];
const ZSTD_MS = 180_000;

export function portablePath(fromBlendRel: string, targetRel: string) {
  const fromDir = parentRel(fromBlendRel) || ".";
  const rel = path.posix.relative(fromDir.replace(/\\/g, "/"), targetRel.replace(/\\/g, "/"));
  if (!rel || path.posix.isAbsolute(rel)) return "";
  return `//${rel.replace(/\//g, "\\")}`;
}

export function studioUnc(rel: string) {
  const root = dataRoot();
  const abs = rel
    ? path.join(/* turbopackIgnore: true */ root, ...rel.split("/").filter(Boolean))
    : root;
  const unc = toUnc(abs);
  return unc.endsWith("\\") ? unc : `${unc}${rel ? "" : "\\"}`;
}

export function pathVariants(rel: string, blendRel: string) {
  const w = rel.replace(/\//g, "\\");
  const rows: string[] = [];
  for (const h of HOSTS) {
    for (const d of ["d", "D"]) rows.push(`\\\\${h}\\${d}\\Data\\${w}`);
  }
  rows.push(`D:\\Data\\${w}`, `d:\\Data\\${w}`);
  rows.push(`/srv/samba/share/Data/${rel}`);
  rows.push(`Data\\${w}`, `Data/${rel}`);
  const portable = portablePath(blendRel, rel);
  if (portable) {
    rows.push(portable);
    rows.push(portable.replace(/\\/g, "/"));
  }
  return [...new Set(rows.filter((s) => s.length >= 8 && s.length <= 420))];
}

function replaceCString(buf: Buffer, from: string, to: string) {
  if (!from || from === to) return 0;
  const src = Buffer.from(from, "utf8");
  const dst = Buffer.from(to, "utf8");
  let n = 0;
  let i = 0;
  while (i <= buf.length - src.length) {
    const at = buf.indexOf(src, i);
    if (at < 0) break;
    const after = at + src.length;
    if (after < buf.length && buf[after] !== 0) {
      i = at + 1;
      continue;
    }
    let zeros = 0;
    while (after + zeros < buf.length && buf[after + zeros] === 0) zeros++;
    if (dst.length + 1 > src.length + zeros) {
      i = after;
      continue;
    }
    dst.copy(buf, at);
    buf[at + dst.length] = 0;
    if (dst.length < src.length) buf.fill(0, at + dst.length + 1, at + src.length);
    n++;
    i = at + Math.max(src.length, dst.length);
  }
  return n;
}

function replaceSuffixWith(buf: Buffer, rel: string, original: string) {
  if (!rel || !original) return 0;
  const needles = [...new Set([rel, rel.replace(/\//g, "\\"), rel.replace(/\\/g, "/")])];
  let n = 0;
  for (const needle of needles) {
    const src = Buffer.from(needle, "utf8");
    let i = 0;
    while (i <= buf.length - src.length) {
      const at = buf.indexOf(src, i);
      if (at < 0) break;
      let start = at;
      while (start > 0 && buf[start - 1] !== 0) start--;
      let end = at + src.length;
      while (end < buf.length && buf[end] !== 0) end++;
      const full = buf.subarray(start, end).toString("utf8");
      const norm = full.replace(/\\/g, "/");
      if (!norm.replace(/^\/+/, "").toLowerCase().endsWith(rel.toLowerCase())) {
        i = at + 1;
        continue;
      }
      n += replaceCString(buf, full, original);
      i = start + Math.max(full.length, original.length);
    }
  }
  return n;
}

async function detectCodec(abs: string): Promise<Codec> {
  const fh = await open(/* turbopackIgnore: true */ abs, "r");
  try {
    const buf = Buffer.alloc(16);
    const { bytesRead } = await fh.read(buf, 0, 16, 0);
    const head = buf.subarray(0, bytesRead);
    if (head.length >= 4 && head[0] === 0x28 && head[1] === 0xb5 && head[2] === 0x2f && head[3] === 0xfd) return "zstd";
    if (head.length >= 2 && head[0] === 0x1f && head[1] === 0x8b) return "gzip";
    return "raw";
  } finally {
    await fh.close();
  }
}

function runZstd(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn("zstd", args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    child.stderr?.on("data", (d) => {
      err += String(d).slice(-800);
    });
    const t = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("zstd слишком долгий"));
    }, ZSTD_MS);
    child.on("error", (e) => {
      clearTimeout(t);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(t);
      if (code === 0) resolve();
      else reject(new Error((err.trim() || "zstd") + ` (${code})`));
    });
  });
}

async function decompressTo(abs: string, dest: string, codec: Codec) {
  if (codec === "zstd") await runZstd(["-d", "-q", "--force", "-o", dest, abs]);
  else if (codec === "gzip") await pipeline(createReadStream(/* turbopackIgnore: true */ abs), createGunzip(), createWriteStream(/* turbopackIgnore: true */ dest));
  else await copyFile(/* turbopackIgnore: true */ abs, dest);
}

async function compressTo(src: string, dest: string, codec: Codec) {
  if (codec === "zstd") await runZstd(["-1", "-q", "--force", "-o", dest, src]);
  else if (codec === "gzip") {
    await pipeline(createReadStream(/* turbopackIgnore: true */ src), createGzip({ level: 1 }), createWriteStream(/* turbopackIgnore: true */ dest));
  } else await copyFile(/* turbopackIgnore: true */ src, dest);
}

function preferredOriginal(rel: string, replacements: BlendReplacement[]) {
  const needle = rel.replace(/\//g, "\\").toLowerCase();
  const hit = replacements.find((r) => {
    const from = r.from.replace(/\//g, "\\").toLowerCase();
    return from.endsWith(needle) || from.endsWith(rel.toLowerCase());
  });
  if (hit) return hit.from;
  return studioUnc(rel);
}

export async function remapBlendFile(opts: {
  srcAbs: string;
  destAbs: string;
  blendRel: string;
  packedRels: string[];
  direction: "portable" | "studio";
  previous?: BlendReplacement[];
}) {
  const codec = await detectCodec(opts.srcAbs);
  const dir = path.dirname(opts.destAbs);
  await mkdir(/* turbopackIgnore: true */ dir, { recursive: true });
  const rawAbs = `${opts.destAbs}.raw`;
  const replacements: BlendReplacement[] = [];
  let skipped = 0;
  try {
    await decompressTo(opts.srcAbs, rawAbs, codec);
    const buf = await readFile(/* turbopackIgnore: true */ rawAbs);
    if (opts.direction === "studio" && opts.previous?.length) {
      const ordered = [...opts.previous].sort((a, b) => b.to.length - a.to.length);
      for (const row of ordered) {
        const n = replaceCString(buf, row.to, row.from);
        if (n) replacements.push({ from: row.to, to: row.from, count: n });
      }
      for (const rel of opts.packedRels) {
        const original = preferredOriginal(rel, opts.previous);
        replaceSuffixWith(buf, rel, original);
      }
    } else {
      const pairs: { from: string; to: string }[] = [];
      const seenFrom = new Set<string>();
      for (const rel of opts.packedRels) {
        if (rel === opts.blendRel) continue;
        const to = portablePath(opts.blendRel, rel);
        if (!to) continue;
        for (const from of pathVariants(rel, opts.blendRel)) {
          if (from === to || seenFrom.has(from)) continue;
          seenFrom.add(from);
          pairs.push({ from, to });
        }
      }
      pairs.sort((a, b) => b.from.length - a.from.length);
      for (const pair of pairs) {
        const n = replaceCString(buf, pair.from, pair.to);
        if (n) replacements.push({ ...pair, count: n });
        else skipped++;
      }
    }
    await writeFile(/* turbopackIgnore: true */ rawAbs, buf);
    await compressTo(rawAbs, opts.destAbs, codec);
  } finally {
    await rm(/* turbopackIgnore: true */ rawAbs, { force: true }).catch(() => {});
  }
  return { replacements, skipped };
}

export function inRestoreScope(rel: string, rootRel: string, replaceGlobal: boolean) {
  if (rel === rootRel || rel === `${rootRel}.md`) return true;
  const isGlobal = rel === "Global" || rel.startsWith("Global/");
  if (isGlobal) return replaceGlobal;
  return true;
}

export async function remapTmpDir() {
  const root = path.join(/* turbopackIgnore: true */ fileRoot(), "tmp-remap");
  await mkdir(/* turbopackIgnore: true */ root, { recursive: true });
  return mkdtemp(assertInside(root, path.join(root, "r-")));
}

export async function buildRelatedZipEntries(rel: string, picked: { rel: string; abs: string }[]) {
  const tmp = await remapTmpDir();
  try {
    const packedRels = picked.map((p) => p.rel);
    const entries: { abs: string; name: string }[] = [];
    const blends: BlendRemapEntry[] = [];
    let i = 0;
    for (const row of picked) {
      if (isBlendName(row.rel)) {
        const destAbs = assertInside(tmp, path.join(tmp, `b${i}-${path.basename(row.rel)}`));
        i += 1;
        const mapped = await remapBlendFile({
          srcAbs: row.abs,
          destAbs,
          blendRel: row.rel,
          packedRels,
          direction: "portable",
        });
        blends.push({ rel: row.rel, replacements: mapped.replacements, skipped: mapped.skipped });
        entries.push({ abs: destAbs, name: row.rel });
      } else {
        entries.push({ abs: row.abs, name: row.rel });
      }
    }
    const manifest: RelatedManifest = {
      version: 1,
      root: rel,
      uncPrefix: studioUnc(""),
      files: packedRels,
      blends,
    };
    const manAbs = assertInside(tmp, path.join(tmp, "vd-links.json"));
    await writeFile(/* turbopackIgnore: true */ manAbs, JSON.stringify(manifest, null, 2), "utf8");
    entries.unshift({ abs: manAbs, name: "vd-links.json" });
    return { entries, tmp, manifest };
  } catch (e) {
    await rm(/* turbopackIgnore: true */ tmp, { recursive: true, force: true }).catch(() => {});
    throw e;
  }
}

type ZipSink = {
  file: (abs: string, opts: { name: string }) => unknown;
  append: (data: string | Buffer, opts: { name: string }) => unknown;
};

export async function fillRelatedZip(
  archive: ZipSink,
  rel: string,
  picked: { rel: string; abs: string }[],
  tmp: string,
  abortFlag?: { aborted: boolean },
  onProgress?: (info: { phase: "copy" | "remap"; index: number; total: number }) => void,
) {
  const packedRels = picked.map((p) => p.rel);
  const blends: BlendRemapEntry[] = [];
  let i = 0;
  const rest = picked.filter((row) => !isBlendName(row.rel));
  const blendRows = picked.filter((row) => isBlendName(row.rel));
  if (rest.length) onProgress?.({ phase: "copy", index: 0, total: rest.length });
  for (const row of rest) {
    if (abortFlag?.aborted) throw new Error("Отменено");
    archive.file(row.abs, { name: row.rel });
  }
  for (const row of blendRows) {
    if (abortFlag?.aborted) throw new Error("Отменено");
    const destAbs = assertInside(tmp, path.join(tmp, `b${i}-${path.basename(row.rel)}`));
    i += 1;
    onProgress?.({ phase: "remap", index: i, total: blendRows.length });
    const mapped = await remapBlendFile({
      srcAbs: row.abs,
      destAbs,
      blendRel: row.rel,
      packedRels,
      direction: "portable",
    });
    blends.push({ rel: row.rel, replacements: mapped.replacements, skipped: mapped.skipped });
    archive.file(destAbs, { name: row.rel });
  }
  const manifest: RelatedManifest = {
    version: 1,
    root: rel,
    uncPrefix: studioUnc(""),
    files: packedRels,
    blends,
  };
  archive.append(JSON.stringify(manifest, null, 2), { name: "vd-links.json" });
  return manifest;
}

async function extractZipSafe(zipAbs: string, dest: string) {
  const script = path.join(/* turbopackIgnore: true */ dest, "_extract.py");
  await writeFile(
    /* turbopackIgnore: true */ script,
    [
      "import os, sys, zipfile, shutil",
      "src, dest = sys.argv[1], os.path.abspath(sys.argv[2])",
      "os.makedirs(dest, exist_ok=True)",
      "with zipfile.ZipFile(src) as z:",
      "    for info in z.infolist():",
      "        name = info.filename.replace(chr(92), '/').lstrip('/')",
      "        if not name or name.endswith('/'): continue",
      "        parts = [p for p in name.split('/') if p and p != '.']",
      "        if not parts or any(p == '..' for p in parts): continue",
      "        out = os.path.join(dest, *parts)",
      "        os.makedirs(os.path.dirname(out), exist_ok=True)",
      "        with z.open(info) as inf, open(out, 'wb') as outf:",
      "            shutil.copyfileobj(inf, outf)",
      "print('OK')",
      "",
    ].join("\n"),
    "utf8",
  );
  await new Promise<void>((resolve, reject) => {
    const child = spawn("python3", [script, zipAbs, dest], { stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    child.stderr?.on("data", (d) => {
      err += String(d).slice(-800);
    });
    const t = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Распаковка слишком долгая"));
    }, 600_000);
    child.on("error", (e) => {
      clearTimeout(t);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(t);
      if (code === 0) resolve();
      else reject(new Error(err.trim() || `unzip ${code}`));
    });
  });
}

async function findManifest(root: string) {
  const walk = async (dir: string, depth: number): Promise<string | null> => {
    const direct = path.join(/* turbopackIgnore: true */ dir, "vd-links.json");
    try {
      const st = await stat(/* turbopackIgnore: true */ direct);
      if (st.isFile()) return assertInside(root, direct);
    } catch {
      /* missing */
    }
    if (depth >= 3) return null;
    let names: string[] = [];
    try {
      names = await readdir(/* turbopackIgnore: true */ dir);
    } catch {
      return null;
    }
    for (const name of names) {
      if (name.startsWith(".") || name === "_extract.py") continue;
      const abs = path.join(/* turbopackIgnore: true */ dir, name);
      try {
        const st = await stat(/* turbopackIgnore: true */ abs);
        if (!st.isDirectory()) continue;
        const found = await walk(abs, depth + 1);
        if (found) return found;
      } catch {
        continue;
      }
    }
    return null;
  };
  const found = await walk(root, 0);
  if (!found) throw new Error("Это не архив связанных файлов (нет vd-links.json)");
  return found;
}

export async function restoreRelatedArchive(opts: { zipAbs: string; rootRel: string; replaceGlobal: boolean }) {
  const rootRel = normalizeRel(opts.rootRel);
  const tmp = await remapTmpDir();
  const unpack = assertInside(tmp, path.join(tmp, "unpack"));
  await mkdir(/* turbopackIgnore: true */ unpack, { recursive: true });
  const written: string[] = [];
  const skippedGlobal: string[] = [];
  let remapped = 0;
  try {
    await extractZipSafe(opts.zipAbs, unpack);
    const manAbs = await findManifest(unpack);
    const packRoot = path.dirname(manAbs);
    let manifest: RelatedManifest;
    try {
      manifest = JSON.parse(await readFile(/* turbopackIgnore: true */ manAbs, "utf8")) as RelatedManifest;
    } catch {
      throw new Error("Это не архив связанных файлов (нет vd-links.json)");
    }
    if (!manifest || manifest.version !== 1 || !Array.isArray(manifest.files) || !Array.isArray(manifest.blends)) {
      throw new Error("Повреждён манифест связей");
    }
    if (manifest.root && normalizeRel(manifest.root) !== rootRel) {
      throw new Error(`Архив от другого файла: ${manifest.root}`);
    }
    const packedRels = manifest.files
      .map((f) => {
        try {
          return normalizeRel(f);
        } catch {
          return "";
        }
      })
      .filter(Boolean);
    const blendMap = new Map<string, BlendRemapEntry>();
    for (const b of manifest.blends) {
      try {
        blendMap.set(normalizeRel(b.rel), b);
      } catch {
        continue;
      }
    }
    for (const raw of packedRels) {
      if (!inRestoreScope(raw, rootRel, opts.replaceGlobal)) {
        skippedGlobal.push(raw);
        continue;
      }
      const src = assertInside(unpack, path.join(packRoot, ...raw.split("/")));
      try {
        await stat(/* turbopackIgnore: true */ src);
      } catch {
        continue;
      }
      let uploadAbs = src;
      const blend = blendMap.get(raw);
      if (blend && isBlendName(raw)) {
        const destAbs = assertInside(tmp, path.join(tmp, `restore-${path.basename(raw)}`));
        const mapped = await remapBlendFile({
          srcAbs: src,
          destAbs,
          blendRel: raw,
          packedRels,
          direction: "studio",
          previous: blend.replacements,
        });
        remapped += mapped.replacements.reduce((s, r) => s + r.count, 0);
        uploadAbs = destAbs;
      }
      const name = raw.split("/").pop() || raw;
      const dir = parentRel(raw);
      await placeUpload(dir, name, uploadAbs);
      written.push(raw);
    }
    if (!written.length) throw new Error("В архиве нечего возвращать");
    return { ok: true as const, written, skippedGlobal, remapped };
  } finally {
    await rm(/* turbopackIgnore: true */ tmp, { recursive: true, force: true }).catch(() => {});
  }
}


