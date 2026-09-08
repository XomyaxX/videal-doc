import { execFile } from "child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const MAX_PAGES = 8;

export function looksLikePdf(mime: string, name: string, buf?: Buffer) {
  if ((mime || "").toLowerCase() === "application/pdf") return true;
  if ((name || "").toLowerCase().endsWith(".pdf")) return true;
  if (buf && buf.slice(0, 5).toString() === "%PDF-") return true;
  return false;
}

export async function rasterPdfPages(buffer: Buffer): Promise<Buffer[]> {
  const dir = await mkdtemp(path.join(/* turbopackIgnore: true */ tmpdir(), "vd-pdf-"));
  try {
    const src = path.join(/* turbopackIgnore: true */ dir, "in.pdf");
    await writeFile(/* turbopackIgnore: true */ src, buffer);
    const prefix = path.join(/* turbopackIgnore: true */ dir, "p");
    await execFileAsync("pdftoppm", ["-png", "-r", "140", "-l", String(MAX_PAGES), src, prefix], {
      timeout: 30000,
    });
    const names = (await readdir(/* turbopackIgnore: true */ dir))
      .filter((n) => n.toLowerCase().endsWith(".png"))
      .sort();
    const out: Buffer[] = [];
    for (const n of names) {
      out.push(await readFile(/* turbopackIgnore: true */ path.join(dir, n)));
    }
    return out;
  } finally {
    await rm(/* turbopackIgnore: true */ dir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function filePreviewPngs(opts: {
  buffer: Buffer;
  mimeType: string;
  originalName: string;
}): Promise<{ mime: string; buffer: Buffer }[]> {
  if (looksLikePdf(opts.mimeType, opts.originalName, opts.buffer)) {
    try {
      const pages = await rasterPdfPages(opts.buffer);
      return pages.map((buffer) => ({ mime: "image/png", buffer }));
    } catch (e) {
      console.error("pdf.raster", opts.originalName, e);
      return [];
    }
  }
  if ((opts.mimeType || "").startsWith("image/")) {
    return [{ mime: opts.mimeType, buffer: opts.buffer }];
  }
  return [];
}

export function pngDataUrl(buffer: Buffer, mime = "image/png") {
  return `data:${mime};base64,${buffer.toString("base64")}`;
}
