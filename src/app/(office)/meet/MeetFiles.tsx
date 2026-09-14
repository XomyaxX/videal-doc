"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import { previewMode } from "@/lib/library-kinds";
import { formatFileSize } from "@/lib/chat-media";
import { ModelPreview } from "@/components/ModelPreview";

export type MeetFile = { id: string; name: string; mime: string; size: number; previewFileId?: string };

function kindOf(f: MeetFile) {
  if (f.previewFileId) return "model3d" as const;
  return previewMode({ mimeType: f.mime, originalName: f.name });
}

function hrefOf(id: string) {
  return `/api/files/${id}`;
}

function thumbOf(f: MeetFile) {
  const k = kindOf(f);
  if (k === "image") return hrefOf(f.id);
  if (k === "pdf") return `${hrefOf(f.id)}?preview=1`;
  return "";
}

function MeetFileViewer({
  files,
  start,
  onClose,
  dark,
}: {
  files: MeetFile[];
  start: number;
  onClose: () => void;
  dark?: boolean;
}) {
  const [i, setI] = useState(start);
  const f = files[i] || files[0];
  const k = kindOf(f);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") setI((n) => (n > 0 ? n - 1 : files.length - 1));
      if (e.key === "ArrowRight") setI((n) => (n + 1) % files.length);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [files.length, onClose]);

  if (!f) return null;

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-navy/90 p-2 md:p-3" onClick={onClose}>
      <div className="mb-2 flex items-center gap-2 text-white" onClick={(e) => e.stopPropagation()}>
        <p className="min-w-0 flex-1 truncate font-semibold">{f.name}</p>
        {f.size ? <span className="text-xs text-white/70">{formatFileSize(f.size)}</span> : null}
        <a href={hrefOf(f.id)} target="_blank" rel="noreferrer" className="rounded-lg p-2 hover:bg-white/10" title="Скачать">
          <Download size={18} />
        </a>
        <button type="button" className="rounded-lg p-2 hover:bg-white/10" onClick={onClose} title="Закрыть">
          <X size={18} />
        </button>
      </div>
      <div className="relative min-h-0 flex-1" onClick={(e) => e.stopPropagation()}>
        {k === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={hrefOf(f.id)} alt={f.name} className="mx-auto max-h-full max-w-full object-contain" />
        ) : k === "pdf" ? (
          <iframe title={f.name} src={hrefOf(f.id)} className="h-full w-full rounded-xl bg-white" />
        ) : k === "video" ? (
          <video src={hrefOf(f.id)} controls className="mx-auto max-h-full w-full rounded-xl bg-black">
            <track kind="captions" />
          </video>
        ) : k === "model3d" ? (
          <ModelPreview src={f.previewFileId ? `${hrefOf(f.id)}?preview=1` : hrefOf(f.id)} tall className="h-full min-h-0 overflow-hidden rounded-xl" />
        ) : (
          <div className={`flex h-full flex-col items-center justify-center rounded-xl ${dark ? "bg-white/10 text-white" : "bg-white text-navy"}`}>
            <p className="font-serif text-xl">В браузере этот файл не открыть</p>
            <p className="mt-2 text-sm opacity-80">Для 3D в окне нужен GLB или GLTF.</p>
            <a href={hrefOf(f.id)} className="mt-3 font-semibold underline">
              Скачать {f.name}
            </a>
          </div>
        )}
        {files.length > 1 ? (
          <>
            <button
              type="button"
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white"
              onClick={() => setI((n) => (n > 0 ? n - 1 : files.length - 1))}
            >
              <ChevronLeft size={20} />
            </button>
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white"
              onClick={() => setI((n) => (n + 1) % files.length)}
            >
              <ChevronRight size={20} />
            </button>
          </>
        ) : null}
      </div>
      {files.length > 1 ? (
        <p className="mt-2 text-center text-xs text-white/70">
          {i + 1} / {files.length}
        </p>
      ) : null}
    </div>
  );
}

export function MeetFileGrid({ files, dark }: { files: MeetFile[]; dark?: boolean }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!files.length) {
    return <p className={`text-sm ${dark ? "text-white/40" : "text-muted"}`}>Файлов нет</p>;
  }
  return (
    <>
      <div className={`grid gap-2 ${dark ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-3"}`}>
        {files.map((f, idx) => {
          const thumb = thumbOf(f);
          const k = kindOf(f);
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setOpen(idx)}
              className={`overflow-hidden rounded-xl text-left ${dark ? "bg-white/10 hover:bg-white/15" : "border border-line bg-white hover:border-gold"}`}
            >
              <div className={`flex items-center justify-center bg-paper ${dark ? "h-28 bg-black/30" : "h-36"}`}>
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumb} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className={`text-xs font-semibold ${dark ? "text-white/70" : "text-navy"}`}>
                    {k === "none" ? "файл" : k}
                  </span>
                )}
              </div>
              <span className={`block truncate px-2 py-1.5 text-xs ${dark ? "text-white/90" : "text-navy"}`}>{f.name}</span>
            </button>
          );
        })}
      </div>
      {open != null ? <MeetFileViewer files={files} start={open} onClose={() => setOpen(null)} dark={dark} /> : null}
    </>
  );
}
