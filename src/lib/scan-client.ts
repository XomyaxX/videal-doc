"use client";

import jsQR from "jsqr";

export type ScanHit = {
  fileName: string;
  previewUrl: string;
  qrRaw: string;
  page: number;
};

function enhance(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const v = g < 140 ? 0 : 255;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
}

export function scanQrFromCanvas(canvas: HTMLCanvasElement): string[] {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  const found = new Set<string>();
  const tryOnce = () => {
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const r = jsQR(data.data, data.width, data.height, { inversionAttempts: "attemptBoth" });
    if (r?.data) found.add(r.data.trim());
  };
  tryOnce();
  if (found.size === 0) {
    enhance(ctx, canvas.width, canvas.height);
    tryOnce();
  }
  return [...found];
}

async function imageToCanvas(file: File): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  const max = 1800;
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  canvas.width = Math.max(1, Math.round(bmp.width * scale));
  canvas.height = Math.max(1, Math.round(bmp.height * scale));
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function pdfPagesToCanvases(file: File): Promise<HTMLCanvasElement[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const pages: HTMLCanvasElement[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d")!;
    await page.render({ canvasContext: ctx, viewport, canvas } as never).promise;
    pages.push(canvas);
  }
  return pages;
}

export async function scanFiles(files: File[], onProgress?: (msg: string) => void): Promise<ScanHit[]> {
  const hits: ScanHit[] = [];
  for (const file of files) {
    onProgress?.(`Читаем ${file.name}…`);
    const previewUrl = URL.createObjectURL(file);
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    try {
      const canvases = isPdf ? await pdfPagesToCanvases(file) : [await imageToCanvas(file)];
      canvases.forEach((canvas, idx) => {
        const qrs = scanQrFromCanvas(canvas);
        if (qrs.length === 0) {
          hits.push({ fileName: file.name, previewUrl, qrRaw: "", page: idx + 1 });
        } else {
          for (const qrRaw of qrs) hits.push({ fileName: file.name, previewUrl, qrRaw, page: idx + 1 });
        }
      });
    } catch {
      hits.push({ fileName: file.name, previewUrl, qrRaw: "", page: 1 });
    }
  }
  return hits;
}
