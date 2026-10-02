import { setHeavyDownload } from "./heavy-download";

export type RelatedZipProgress = {
  pct: number;
  loaded: number;
  total: number;
  phase: "prepare" | "download" | "done";
  label?: string;
  hint?: string;
};

export type RelatedZipWritable = {
  write: (data: Uint8Array) => Promise<unknown>;
  close: () => Promise<void>;
  abort?: () => Promise<void>;
};

type JobInfo = {
  id?: string;
  status?: "run" | "ready" | "fail" | "abort";
  pct?: number;
  hint?: string;
  bytes?: number;
  name?: string;
  error?: string;
};

function filenameFromDisposition(header: string | null, fallback: string) {
  if (!header) return fallback;
  const star = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (star) {
    try {
      return decodeURIComponent(star[1]);
    } catch {
      return fallback;
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain ? plain[1] : fallback;
}

export async function pickRelatedZipSave(suggestedName: string): Promise<RelatedZipWritable | null> {
  const w = window as Window & {
    showSaveFilePicker?: (opts: {
      suggestedName?: string;
      types?: { description: string; accept: Record<string, string[]> }[];
    }) => Promise<{
      createWritable: () => Promise<RelatedZipWritable>;
    }>;
  };
  if (typeof w.showSaveFilePicker !== "function") return null;
  const handle = await w.showSaveFilePicker({
    suggestedName,
    types: [{ description: "ZIP-архив", accept: { "application/zip": [".zip"] } }],
  });
  return handle.createWritable();
}

async function readJob(id: string, signal?: AbortSignal) {
  const res = await fetch(`/api/data/related-job?id=${encodeURIComponent(id)}`, {
    credentials: "same-origin",
    signal,
  });
  const data = (await res.json().catch(() => ({}))) as JobInfo & { error?: string };
  if (!res.ok) throw new Error(data.error || `Не удалось узнать статус (${res.status})`);
  return data;
}

export async function downloadRelatedZip(opts: {
  rel: string;
  estimate?: number;
  suggestedName: string;
  writable?: RelatedZipWritable | null;
  signal?: AbortSignal;
  onProgress: (p: RelatedZipProgress) => void;
}) {
  setHeavyDownload(true);
  let jobId = "";
  let finished = false;
  let writable = opts.writable || null;
  try {
    opts.onProgress({ pct: 1, loaded: 0, total: opts.estimate || 0, phase: "prepare", label: "Собираю архив…" });
    const started = await fetch("/api/data/related-job", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ p: opts.rel }),
      signal: opts.signal,
    });
    const startData = (await started.json().catch(() => ({}))) as JobInfo & { error?: string };
    if (!started.ok || !startData.id) throw new Error(startData.error || "Не удалось начать сборку");
    jobId = startData.id;

    let job = startData;
    while (job.status === "run") {
      opts.onProgress({
        pct: Math.max(1, Math.min(99, job.pct || 1)),
        loaded: 0,
        total: opts.estimate || 0,
        phase: "prepare",
        label: job.hint || "Собираю архив…",
      });
      await new Promise((r) => window.setTimeout(r, 500));
      if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      job = await readJob(jobId, opts.signal);
    }
    if (job.status !== "ready") throw new Error(job.error || job.hint || "Не удалось собрать архив");

    const total = job.bytes || opts.estimate || 0;
    opts.onProgress({ pct: 0, loaded: 0, total, phase: "download", label: "Скачиваю" });
    const res = await fetch(`/api/data/related-zip?job=${encodeURIComponent(jobId)}`, {
      credentials: "same-origin",
      signal: opts.signal,
    });
    const name = filenameFromDisposition(res.headers.get("Content-Disposition"), job.name || opts.suggestedName);
    const estimateHeader = Number(res.headers.get("Content-Length") || res.headers.get("X-Zip-Estimate") || 0);
    const size = Number.isFinite(estimateHeader) && estimateHeader > 0 ? estimateHeader : total;
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error || `Не удалось скачать (${res.status})`);
    }
    if (!res.body) throw new Error("Пустой ответ");

    const reader = res.body.getReader();
    const chunks: ArrayBuffer[] = [];
    let loaded = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.length) continue;
      loaded += value.byteLength;
      const pct = size ? Math.min(99, Math.round((loaded / size) * 100)) : Math.min(99, 50);
      opts.onProgress({
        pct: Math.max(1, pct),
        loaded,
        total: size,
        phase: "download",
        label: "Скачиваю",
      });
      if (writable) await writable.write(value);
      else chunks.push(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer);
    }
    if (writable) {
      await writable.close();
      writable = null;
    } else {
      const blob = new Blob(chunks, { type: "application/zip" });
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = name;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 30_000);
    }
    opts.onProgress({ pct: 100, loaded, total: size || loaded, phase: "done", label: "Готово" });
    finished = true;
  } catch (e) {
    if (writable?.abort) await writable.abort().catch(() => {});
    else if (writable) await writable.close().catch(() => {});
    throw e;
  } finally {
    setHeavyDownload(false);
    const cancel = finished || opts.signal?.aborted;
    if (jobId && cancel) {
      void fetch(`/api/data/related-job?id=${encodeURIComponent(jobId)}`, {
        method: "DELETE",
        credentials: "same-origin",
      }).catch(() => {});
    }
  }
}
