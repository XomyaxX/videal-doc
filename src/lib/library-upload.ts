import { guessLibraryKind, titleFromFilename } from "./library-kinds";
import { newUploadId } from "./upload-id";

const CHUNK = 4 * 1024 * 1024;

export async function uploadLibraryFile(opts: {
  file: File;
  fileName?: string;
  parentId?: string;
  title?: string;
  kind?: string;
  description?: string;
}) {
  const fileName = opts.fileName || opts.file.name;
  const title = opts.title || titleFromFilename(fileName);
  const kind = opts.kind || guessLibraryKind(fileName);
  const description = opts.description || title;
  const total = Math.max(1, Math.ceil(opts.file.size / CHUNK));
  const uploadId = newUploadId();
  let last: { id?: string; error?: string } = {};
  for (let i = 0; i < total; i++) {
    const blob = opts.file.slice(i * CHUNK, (i + 1) * CHUNK);
    const fd = new FormData();
    fd.set("uploadId", uploadId);
    fd.set("chunkIndex", String(i));
    fd.set("chunkTotal", String(total));
    fd.set("fileName", fileName);
    fd.set("mime", opts.file.type || "");
    fd.append("chunk", blob, `part-${i}`);
    if (i === total - 1) {
      fd.set("title", title);
      fd.set("kind", kind);
      fd.set("description", description);
      if (opts.parentId) fd.set("parentId", opts.parentId);
    }
    const res = await fetch("/api/library/chunk", { method: "POST", body: fd });
    const raw = await res.text();
    try {
      last = JSON.parse(raw) as { id?: string; error?: string };
    } catch {
      last = {};
    }
    if (!res.ok) {
      throw new Error(last.error || `Не удалось загрузить ${fileName} (${res.status})`);
    }
  }
  return last;
}
