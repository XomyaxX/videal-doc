"use client";

import { useMemo, useState } from "react";
import { previewMode } from "@/lib/library-kinds";

export type TaskFileChip = {
  id: string;
  originalName: string;
  mimeType: string;
};

function kindOf(file: TaskFileChip): "video" | "image" | "pdf" | "none" {
  const mode = previewMode({ mimeType: file.mimeType, originalName: file.originalName });
  const ext = file.originalName.toLowerCase().slice(file.originalName.lastIndexOf("."));
  if (ext === ".mov" || ext === ".m4v") return "video";
  if (ext === ".gif") return "image";
  return mode;
}

function rank(file: TaskFileChip) {
  const k = kindOf(file);
  if (k === "video") return 0;
  if (k === "image") return 1;
  if (k === "pdf") return 2;
  return 3;
}

export function TaskPreview({ files }: { files: TaskFileChip[] }) {
  const ordered = useMemo(() => [...files].sort((a, b) => rank(a) - rank(b)), [files]);
  const [currentId, setCurrentId] = useState(ordered[0]?.id || "");
  const current = files.find((f) => f.id === currentId) || ordered[0] || null;
  const src = current ? `/api/prod/files/${current.id}` : "";
  const kind = current ? kindOf(current) : "none";

  if (files.length === 0) {
    return (
      <div className="mt-5 rounded-2xl border border-dashed border-line bg-paper px-4 py-8 text-center">
        <p className="font-serif text-lg text-navy">Плейбласт ещё не сдан</p>
        <p className="mt-1 text-sm text-muted">mp4, картинка или PDF появятся здесь после загрузки.</p>
      </div>
    );
  }

  return (
    <div className="mt-5 space-y-3">
      <div className="overflow-hidden rounded-2xl border border-line bg-navy">
        {kind === "video" ? (
          <video key={src} src={src} controls preload="metadata" className="max-h-[420px] w-full bg-navy">
            <track kind="captions" />
          </video>
        ) : kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={current?.originalName || ""} className="max-h-[420px] w-full object-contain bg-[#111]" />
        ) : kind === "pdf" ? (
          <iframe title={current?.originalName || "PDF"} src={src} className="h-[420px] w-full bg-white" />
        ) : (
          <div className="px-4 py-10 text-center">
            <a href={src} className="font-semibold text-gold underline">
              {current?.originalName}
            </a>
            <p className="mt-1 text-sm text-white/70">Этот формат в плеере не открыть — скачайте.</p>
          </div>
        )}
      </div>
      <ul className="flex flex-wrap gap-2">
        {files.map((f) => {
          const on = f.id === (current?.id || "");
          return (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => setCurrentId(f.id)}
                title={f.originalName}
                className={`max-w-[220px] truncate rounded-xl border px-3 py-1.5 text-left text-xs font-semibold ${
                  on ? "border-gold bg-white text-navy" : "border-line bg-paper text-muted hover:border-gold hover:text-navy"
                }`}
              >
                {f.originalName}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
