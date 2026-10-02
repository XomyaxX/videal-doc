import { createHash } from "crypto";
import { spawn } from "child_process";
import { createReadStream } from "fs";
import { mkdir, stat } from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { NextResponse } from "next/server";
import { fileRoot } from "./files";

export type ThumbKind = "image" | "video" | "pdf";

const WEB_IMAGE = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const STILL_IMAGE = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tif", ".tiff"]);
const VIDEO_EXT = new Set([".mp4", ".webm", ".mov", ".m4v", ".mkv", ".avi"]);
const DIRECT_IMAGE = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);

function extOf(name: string) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

export function thumbKindOf(name: string, mime = ""): ThumbKind | null {
  const ext = extOf(name);
  const m = (mime || "").toLowerCase();
  if (m === "application/pdf" || ext === ".pdf") return "pdf";
  if (m.startsWith("video/") || VIDEO_EXT.has(ext)) return "video";
  if (STILL_IMAGE.has(ext) || (m.startsWith("image/") && m !== "image/svg+xml")) return "image";
  if (ext === ".svg" || m === "image/svg+xml") return "image";
  return null;
}

export function isSmallWebImage(name: string, size: number) {
  const ext = extOf(name);
  if (ext === ".svg") return size > 0 && size <= 2 * 1024 * 1024;
  return WEB_IMAGE.has(ext) && size > 0 && size <= 2 * 1024 * 1024;
}

function imageMime(name: string, mime: string) {
  if (mime && mime !== "application/octet-stream") return mime;
  const ext = extOf(name);
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".bmp") return "image/bmp";
  return "image/jpeg";
}

function run(cmd: string, args: string[], ms = 25000) {
  return new Promise<boolean>((resolve) => {
    const p = spawn(cmd, args, { stdio: "ignore" });
    const t = setTimeout(() => {
      p.kill("SIGKILL");
      resolve(false);
    }, ms);
    p.on("close", (code) => {
      clearTimeout(t);
      resolve(code === 0);
    });
    p.on("error", () => {
      clearTimeout(t);
      resolve(false);
    });
  });
}

let active = 0;
const wait: Array<() => void> = [];
const MAX = 2;
const WAIT_MAX = 8;
const THUMB_SRC_MAX = 2 * 1024 * 1024 * 1024;

async function slot<T>(fn: () => Promise<T>): Promise<T | null> {
  if (active >= MAX) {
    if (wait.length >= WAIT_MAX) return null;
    await new Promise<void>((r) => wait.push(r));
  }
  active += 1;
  try {
    return await fn();
  } finally {
    active -= 1;
    wait.shift()?.();
  }
}

async function makeThumb(src: string, dest: string, kind: ThumbKind) {
  const scale = "scale='min(480\\,iw)':-2";
  if (kind === "video") {
    const tries = [
      ["-y", "-ss", "1", "-i", src, "-frames:v", "1", "-vf", scale, "-q:v", "4", dest],
      ["-y", "-ss", "0", "-i", src, "-frames:v", "1", "-vf", scale, "-q:v", "4", dest],
    ];
    for (const args of tries) {
      if (await run("ffmpeg", args)) return true;
    }
    return false;
  }
  if (kind === "pdf") {
    const prefix = dest.replace(/\.jpg$/i, "");
    if (await run("pdftoppm", ["-jpeg", "-f", "1", "-l", "1", "-r", "72", "-singlefile", src, prefix], 20000)) {
      try {
        const st = await stat(/* turbopackIgnore: true */ dest);
        if (st.size > 200) return true;
      } catch {
        /* ffmpeg fallback */
      }
    }
    return run("ffmpeg", ["-y", "-i", src, "-frames:v", "1", "-vf", scale, "-q:v", "4", dest], 20000);
  }
  return run("ffmpeg", ["-y", "-i", src, "-frames:v", "1", "-vf", scale, "-q:v", "4", dest], 20000);
}

export async function mediaThumbPath(srcAbs: string, kind: ThumbKind): Promise<string | null> {
  let st;
  try {
    st = await stat(/* turbopackIgnore: true */ srcAbs);
  } catch {
    return null;
  }
  if (!st.isFile() || st.size < 32) return null;
  if (st.size > THUMB_SRC_MAX) return null;
  const key = createHash("sha1").update(`${srcAbs}:${st.mtimeMs}:${st.size}:${kind}`).digest("hex");
  const dir = path.join(/* turbopackIgnore: true */ fileRoot(), "thumbs");
  await mkdir(/* turbopackIgnore: true */ dir, { recursive: true });
  const dest = path.join(/* turbopackIgnore: true */ dir, `${key}.jpg`);
  try {
    const have = await stat(/* turbopackIgnore: true */ dest);
    if (have.size > 200) return dest;
  } catch {
    /* generate */
  }
  return slot(async () => {
    try {
      const have = await stat(/* turbopackIgnore: true */ dest);
      if (have.size > 200) return dest;
    } catch {
      /* still missing */
    }
    const ok = await makeThumb(srcAbs, dest, kind);
    if (!ok) return null;
    try {
      const have = await stat(/* turbopackIgnore: true */ dest);
      return have.size > 200 ? dest : null;
    } catch {
      return null;
    }
  });
}

export async function videoPosterPath(srcAbs: string) {
  return mediaThumbPath(srcAbs, "video");
}

export async function serveThumbFile(abs: string, mime = "image/jpeg") {
  const st = await stat(/* turbopackIgnore: true */ abs);
  const node = createReadStream(/* turbopackIgnore: true */ abs);
  return new NextResponse(Readable.toWeb(node) as unknown as ReadableStream, {
    headers: {
      "Content-Type": mime,
      "Content-Length": String(st.size),
      "Cache-Control": "private, max-age=86400",
    },
  });
}

export async function serveMediaThumb(srcAbs: string, name: string, mime = "") {
  let st;
  try {
    st = await stat(/* turbopackIgnore: true */ srcAbs);
  } catch {
    return null;
  }
  if (!st.isFile() || st.size < 16) return null;
  const kind = thumbKindOf(name, mime);
  if (!kind) return null;
  if (kind === "image" && (DIRECT_IMAGE.has(extOf(name)) && isSmallWebImage(name, st.size))) {
    return serveThumbFile(srcAbs, imageMime(name, mime));
  }
  const dest = await mediaThumbPath(srcAbs, kind);
  if (!dest) return null;
  return serveThumbFile(dest);
}
