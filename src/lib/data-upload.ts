import { newUploadId } from "./upload-id";

const CHUNK = 4 * 1024 * 1024;

function postForm(
  url: string,
  body: FormData,
  onSent?: (loaded: number, total: number) => void,
): Promise<{ ok: boolean; status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onSent?.(e.loaded, e.total);
    };
    xhr.onload = () => resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, text: xhr.responseText });
    xhr.onerror = () => reject(new Error("Сеть недоступна"));
    xhr.send(body);
  });
}

export async function uploadDataFile(opts: {
  file: File;
  fileName?: string;
  dir?: string;
  extra?: Record<string, string>;
  onProgress?: (pct: number) => void;
}) {
  const fileName = opts.fileName || opts.file.name;
  const size = opts.file.size;
  const total = Math.max(1, Math.ceil(size / CHUNK));
  const uploadId = newUploadId();
  let last: { rel?: string; error?: string; written?: string[]; skippedGlobal?: string[]; remapped?: number } = {};
  for (let i = 0; i < total; i++) {
    const blob = opts.file.slice(i * CHUNK, (i + 1) * CHUNK);
    const fd = new FormData();
    fd.set("uploadId", uploadId);
    fd.set("chunkIndex", String(i));
    fd.set("chunkTotal", String(total));
    fd.set("fileName", fileName);
    fd.append("chunk", blob, `part-${i}`);
    if (i === total - 1) {
      fd.set("dir", opts.dir || "");
      if (opts.extra) {
        for (const [k, v] of Object.entries(opts.extra)) fd.set(k, v);
      }
    }
    const res = await postForm("/api/data/chunk", fd, (loaded, body) => {
      const chunkBytes = blob.size || 1;
      const sent = Math.min(chunkBytes, Math.round((loaded / Math.max(body, 1)) * chunkBytes));
      const done = i * CHUNK + sent;
      opts.onProgress?.(size ? Math.min(99, Math.round((done / size) * 100)) : 100);
    });
    try {
      last = JSON.parse(res.text) as { rel?: string; error?: string };
    } catch {
      last = {};
    }
    if (!res.ok) {
      throw new Error(last.error || `Не удалось загрузить ${fileName} (${res.status})`);
    }
  }
  opts.onProgress?.(100);
  return last;
}
