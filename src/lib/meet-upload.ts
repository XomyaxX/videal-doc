const CHUNK = 4 * 1024 * 1024;
const LIMIT = 512 * 1024 * 1024;

export type UploadProgress = { pct: number; phase: "upload" | "convert"; name: string };

export async function uploadChunkedFile(
  url: string,
  file: File,
  onProgress?: (info: UploadProgress) => void,
) {
  if (file.size > LIMIT) {
    throw new Error(`«${file.name}» слишком большой (${(file.size / 1024 / 1024).toFixed(1)} МБ, лимит 512 МБ)`);
  }
  const total = Math.max(1, Math.ceil(file.size / CHUNK));
  const uploadId = crypto.randomUUID();
  const threeD = /\.(blend|fbx|obj|stl|abc)$/i.test(file.name);
  let last: Record<string, unknown> = {};
  for (let i = 0; i < total; i++) {
    if (i === total - 1 && threeD) onProgress?.({ pct: 100, phase: "convert", name: file.name });
    else onProgress?.({ pct: Math.round(((i + 1) / total) * 100), phase: "upload", name: file.name });
    const blob = file.slice(i * CHUNK, Math.min(file.size, (i + 1) * CHUNK));
    const fd = new FormData();
    fd.set("file", blob, file.name);
    fd.set("name", file.name);
    fd.set("uploadId", uploadId);
    fd.set("chunkIndex", String(i));
    fd.set("chunkTotal", String(total));
    const up = await fetch(url, { method: "POST", body: fd });
    const d = await up.json().catch(() => ({}));
    if (!up.ok) {
      throw new Error(d.error || `Файл «${file.name}» не ушёл (${up.status}, ${(file.size / 1024 / 1024).toFixed(1)} МБ)`);
    }
    last = d;
  }
  return last;
}

export async function uploadMeetFile(meetId: string, file: File) {
  return uploadChunkedFile(`/api/meet/${meetId}/files`, file);
}
