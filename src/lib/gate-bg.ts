import { spawn } from "child_process";
import { createReadStream, createWriteStream } from "fs";
import { mkdir, readdir, rename, rm, stat } from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { NextResponse } from "next/server";
import { prisma } from "./prisma";
import { assertInside } from "./files";

export const GATE_BG_MAX = 512 * 1024 * 1024;

const EXT_MIME: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".ogv": "video/ogg",
  ".gif": "image/gif",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
};

export function gateBgDir() {
  return path.resolve(/* turbopackIgnore: true */ path.join(process.cwd(), "data", "gate-bg"));
}

export function gateBgKind(mime: string): "video" | "image" | "" {
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("image/")) return "image";
  return "";
}

export async function gateBgMeta() {
  const row = await prisma.appSettings.findUnique({
    where: { id: "default" },
    select: { gateBgFile: true, gateBgMime: true, gateBgName: true },
  });
  const file = row?.gateBgFile || "";
  if (!file || file.includes("/") || file.includes("\\") || file.includes("..")) return null;
  const abs = assertInside(gateBgDir(), path.join(/* turbopackIgnore: true */ gateBgDir(), file));
  try {
    const st = await stat(/* turbopackIgnore: true */ abs);
    if (!st.isFile() || st.size <= 0) return null;
    const mime = row?.gateBgMime || "application/octet-stream";
    const kind = gateBgKind(mime);
    if (!kind) return null;
    return { abs, mime, name: row?.gateBgName || file, kind, v: Math.round(st.mtimeMs), size: st.size };
  } catch {
    return null;
  }
}

export function gateBgResponse(abs: string, mime: string, size: number, range: string | null, cache = "private, max-age=3600") {
  const common: Record<string, string> = {
    "Content-Type": mime,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": cache,
    "Accept-Ranges": "bytes",
    "Content-Disposition": "inline",
  };
  const matched = range ? /bytes=(\d+)-(\d*)/.exec(range) : null;
  let start = 0;
  let end = size - 1;
  let status = 200;
  if (matched) {
    start = Number(matched[1]);
    end = matched[2] ? Number(matched[2]) : size - 1;
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

export async function saveGateBg(file: File) {
  const original = (file.name || "фон").replace(/[\r\n]/g, " ").slice(0, 180);
  const ext = path.extname(original).toLowerCase();
  const mime = EXT_MIME[ext];
  if (!mime) {
    return { ok: false as const, error: "Подойдут MP4, WEBM, MOV, GIF, JPG, PNG или WEBP." };
  }
  if (file.size > GATE_BG_MAX) {
    return { ok: false as const, error: "Файл больше 512 МБ." };
  }
  const dir = gateBgDir();
  await mkdir(/* turbopackIgnore: true */ dir, { recursive: true });
  const tmp = assertInside(dir, path.join(/* turbopackIgnore: true */ dir, `.upload-${Date.now()}`));
  const destName = `background${ext}`;
  const dest = assertInside(dir, path.join(/* turbopackIgnore: true */ dir, destName));
  try {
    await pipeline(
      Readable.fromWeb(file.stream() as import("stream/web").ReadableStream),
      createWriteStream(/* turbopackIgnore: true */ tmp),
    );
    const st = await stat(/* turbopackIgnore: true */ tmp);
    if (st.size <= 0 || st.size > GATE_BG_MAX) {
      await rm(/* turbopackIgnore: true */ tmp, { force: true });
      return { ok: false as const, error: st.size <= 0 ? "Файл пустой." : "Файл больше 512 МБ." };
    }
    const names = await readdir(/* turbopackIgnore: true */ dir);
    for (const name of names) {
      if (name.startsWith(".upload-")) continue;
      await rm(assertInside(dir, path.join(/* turbopackIgnore: true */ dir, name)), { force: true });
    }
    await rename(/* turbopackIgnore: true */ tmp, /* turbopackIgnore: true */ dest);
  } catch (err) {
    await rm(/* turbopackIgnore: true */ tmp, { force: true }).catch(() => null);
    throw err;
  }
  await prisma.appSettings.upsert({
    where: { id: "default" },
    create: { id: "default", gateBgFile: destName, gateBgMime: mime, gateBgName: original },
    update: { gateBgFile: destName, gateBgMime: mime, gateBgName: original },
  });
  return { ok: true as const, name: original, mime, kind: gateBgKind(mime) as "video" | "image" };
}

export async function clearGateBg() {
  await rm(/* turbopackIgnore: true */ gateBgDir(), { recursive: true, force: true });
  await prisma.appSettings.updateMany({
    where: { id: "default" },
    data: { gateBgFile: "", gateBgMime: "", gateBgName: "" },
  });
}

const SCREEN_CACHE = "no-store";

function screenPath(name: string) {
  const dir = gateBgDir();
  return assertInside(dir, path.join(/* turbopackIgnore: true */ dir, name));
}

function runBin(args: string[], ms: number) {
  return new Promise<boolean>((resolve) => {
    const p = spawn("ffmpeg", args, { stdio: "ignore" });
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

async function fileFresh(file: string, sourceMs: number) {
  try {
    const st = await stat(/* turbopackIgnore: true */ file);
    return st.isFile() && st.size > 0 && st.mtimeMs + 2000 >= sourceMs;
  } catch {
    return false;
  }
}

let posterJob: Promise<boolean> | null = null;
let videoJob: Promise<boolean> | null = null;

async function ensurePoster(abs: string, sourceMs: number) {
  const dest = screenPath("screen.poster.jpg");
  if (await fileFresh(dest, sourceMs)) return true;
  if (posterJob) return posterJob;
  posterJob = (async () => {
    const tmp = screenPath("screen.poster.tmp.jpg");
    const ok = await runBin(
      ["-y", "-i", abs, "-map", "0:v:0", "-an", "-map_metadata", "-1", "-vf", "scale=1280:720:force_original_aspect_ratio=decrease", "-frames:v", "1", "-q:v", "4", tmp],
      40000,
    );
    if (!ok) {
      await rm(tmp, { force: true }).catch(() => null);
      return false;
    }
    await rename(tmp, dest);
    return fileFresh(dest, sourceMs);
  })().finally(() => {
    posterJob = null;
  });
  return posterJob;
}

function lightVideoArgs(input: string, dest: string, still: boolean) {
  const head = still
    ? ["-y", "-loop", "1", "-i", input, "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", "10"]
    : ["-y", "-i", input, "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo"];
  return [
    ...head,
    "-map", "0:v:0",
    "-map", "1:a:0",
    "-shortest",
    "-map_metadata", "-1",
    "-c:v", "libx264",
    "-profile:v", "baseline",
    "-level", "3.1",
    "-pix_fmt", "yuv420p",
    "-preset", "veryfast",
    "-x264-params", "bframes=0:cabac=0:ref=1",
    "-vf", still ? "scale=1280:720:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2" : "scale=1280:720:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2",
    "-r", still ? "1" : "24",
    "-b:v", still ? "200k" : "800k",
    "-maxrate", still ? "400k" : "1000k",
    "-bufsize", still ? "400k" : "1600k",
    "-c:a", "aac",
    "-b:a", "32k",
    "-ac", "2",
    "-movflags", "+faststart",
    dest,
  ];
}

async function ensureVideo(abs: string, mime: string, kind: string, sourceMs: number) {
  const dest = screenPath("screen.mp4");
  if (await fileFresh(dest, sourceMs)) return true;
  const motion = kind === "video" || mime === "image/gif";
  if (!motion && !(await fileFresh(screenPath("screen.poster.jpg"), sourceMs))) return false;
  if (videoJob) return videoJob;
  videoJob = (async () => {
    const tmp = screenPath("screen.tmp.mp4");
    const input = motion ? abs : screenPath("screen.poster.jpg");
    const ok = await runBin(lightVideoArgs(input, tmp, !motion), motion ? 180000 : 60000);
    if (!ok) {
      await rm(tmp, { force: true }).catch(() => null);
      return false;
    }
    await rename(tmp, dest);
    return fileFresh(dest, sourceMs);
  })().finally(() => {
    videoJob = null;
  });
  return videoJob;
}

export async function gateScreenFiles() {
  const meta = await gateBgMeta();
  if (!meta) return null;
  const posterOk = await ensurePoster(meta.abs, meta.v).catch(() => false);
  const videoOk = await fileFresh(screenPath("screen.mp4"), meta.v);
  if (!videoOk) void ensureVideo(meta.abs, meta.mime, meta.kind, meta.v).catch(() => false);
  return {
    v: meta.v,
    posterAbs: posterOk ? screenPath("screen.poster.jpg") : null,
    videoAbs: videoOk ? screenPath("screen.mp4") : null,
  };
}

export { SCREEN_CACHE };
