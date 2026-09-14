import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { spawn } from "child_process";
import os from "os";
import path from "path";
import { saveUpload } from "./files";

const CONVERT = new Set([".blend", ".fbx", ".obj", ".stl", ".abc"]);

export function needsGlbPreview(originalName: string) {
  return CONVERT.has(path.extname(originalName || "").toLowerCase());
}

function blenderBin() {
  const list = [process.env.BLENDER_BIN, "/opt/blender/blender", "/usr/bin/blender"].filter(Boolean) as string[];
  return list.find((p) => p === "blender" || existsSync(p)) || "blender";
}

function runBlender(src: string, dst: string) {
  const script = path.join(process.cwd(), "scripts", "blender-to-glb.py");
  return new Promise<void>((resolve, reject) => {
    const child = spawn(/* turbopackIgnore: true */ blenderBin(), ["--background", "--python", script, "--", src, dst], {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        DISPLAY: "",
        PYTHONPATH: [process.env.PYTHONPATH, "/usr/lib/python3/dist-packages", "/usr/lib/python3.10/dist-packages"]
          .filter(Boolean)
          .join(":"),
      },
    });
    let err = "";
    child.stderr?.on("data", (d) => {
      err += String(d).slice(-2000);
    });
    const t = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Конвертация 3D слишком долгая"));
    }, 180_000);
    child.on("error", (e) => {
      clearTimeout(t);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(t);
      if (code === 0) resolve();
      else reject(new Error((err.trim() || "Blender не смог собрать GLB") + ` (code ${code})`));
    });
  });
}

export async function convertToGlb(buffer: Buffer, originalName: string): Promise<Buffer | null> {
  if (!needsGlbPreview(originalName)) return null;
  const ext = path.extname(originalName).toLowerCase() || ".bin";
  const dir = await mkdtemp(path.join(os.tmpdir(), "vd-glb-"));
  const src = path.join(dir, `src${ext}`);
  const dst = path.join(dir, "preview.glb");
  try {
    await writeFile(src, buffer);
    await runBlender(src, dst);
    const out = await readFile(dst);
    if (out.length < 16) return null;
    return out;
  } catch (e) {
    console.error("glb-convert", originalName, e);
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function storeGlbPreview(opts: {
  buffer: Buffer;
  originalName: string;
  userId: string;
  maxBytes: number;
}) {
  try {
    const glb = await convertToGlb(opts.buffer, opts.originalName);
    if (!glb) return "";
    const rec = await saveUpload({
      buffer: glb,
      originalName: `${path.basename(opts.originalName, path.extname(opts.originalName))}.glb`,
      declaredMime: "model/gltf-binary",
      userId: opts.userId,
      maxBytes: Math.max(opts.maxBytes, glb.length + 1024),
    });
    return rec.id;
  } catch (e) {
    console.error("glb-preview-store", opts.originalName, e);
    return "";
  }
}
