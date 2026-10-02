"use client";

import { useState } from "react";
import { LIBRARY_KIND_LABEL, type PreviewKind } from "@/lib/library-kinds";
import { ModelPreview } from "./ModelPreview";
import { DocxPreview } from "./DocxPreview";

export type LibraryFileCard = {
  id: string;
  originalName: string;
  mimeType: string;
  uncPath?: string;
  preview: PreviewKind;
  fileUrl: string;
  previewUrl?: string;
  thumbUrl: string;
};

export type LibraryCard = {
  id: string;
  title: string;
  kind: string;
  kindLabel?: string;
  description: string;
  originalName: string;
  mimeType: string;
  uncPath: string;
  preview: PreviewKind;
  thumbUrl: string;
  fileUrl: string;
  href: string;
  fileCount?: number;
  files?: LibraryFileCard[];
  isFolder?: boolean;
  shareEnabled?: boolean;
  shareToken?: string;
  shareDownload?: boolean;
  shareEdit?: boolean;
  shareCreate?: boolean;
  restricted?: boolean;
};

function FolderGlyph() {
  return (
    <svg viewBox="0 0 96 76" className="h-[62%] w-auto" aria-hidden>
      <path d="M8 20c0-3.3 2.7-6 6-6h22l8 8h38c3.3 0 6 2.7 6 6v36c0 3.3-2.7 6-6 6H14c-3.3 0-6-2.7-6-6V20z" fill="#c9a36a" />
      <path d="M8 32h80v32c0 3.3-2.7 6-6 6H14c-3.3 0-6-2.7-6-6V32z" fill="#a57c3b" />
      <path d="M8 32h80v5H8z" fill="#d8bc86" />
    </svg>
  );
}

function FileGlyph({ ext }: { ext: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <svg viewBox="0 0 56 68" className="h-14 w-auto" aria-hidden>
        <path d="M8 4h26l14 14v42c0 2.2-1.8 4-4 4H12c-2.2 0-4-1.8-4-4V8c0-2.2 1.8-4 4-4z" fill="#fff" stroke="#c9a36a" strokeWidth="2" />
        <path d="M34 4v12c0 1.1.9 2 2 2h12" fill="#f3eee6" stroke="#c9a36a" strokeWidth="2" />
      </svg>
      {ext ? (
        <span className="rounded-md bg-navy px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">{ext}</span>
      ) : null}
    </div>
  );
}

export function LibraryThumb({ item, className = "" }: { item: LibraryCard; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (item.isFolder || item.kind === "folder") {
    return (
      <div className={`flex items-center justify-center bg-gradient-to-b from-[#f4ece0] to-[#e4d8c4] ${className}`}>
        <FolderGlyph />
      </div>
    );
  }
  if (item.thumbUrl && !broken) {
    return (
      <div className={`relative overflow-hidden bg-[#1c1916] ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.thumbUrl}
          alt={item.title}
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          onError={() => setBroken(true)}
        />
        {item.preview === "video" ? (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-navy/75 text-white shadow">
              <svg viewBox="0 0 24 24" className="ml-0.5 h-6 w-6" aria-hidden>
                <path fill="currentColor" d="M8 5v14l11-7z" />
              </svg>
            </span>
          </span>
        ) : null}
      </div>
    );
  }
  const ext = (item.originalName || "").split(".").pop()?.toLowerCase() || "";
  const show = ext && ext.length <= 5 && ext !== item.originalName.toLowerCase() ? ext : "";
  return (
    <div className={`flex items-center justify-center bg-[#ece7de] ${className}`}>
      <FileGlyph ext={show} />
    </div>
  );
}

function downloadHref(fileUrl: string) {
  if (!fileUrl.includes("/api/l/")) return fileUrl;
  return `${fileUrl}${fileUrl.includes("?") ? "&" : "?"}dl=1`;
}

function rasterNeedsThumb(file: LibraryFileCard) {
  const name = (file.originalName || "").toLowerCase();
  return name.endsWith(".tif") || name.endsWith(".tiff") || file.mimeType === "image/tiff";
}

function FileView({ file, allowDownload }: { file: LibraryFileCard; allowDownload: boolean }) {
  const dl = allowDownload ? downloadHref(file.fileUrl) : "";
  if (file.preview === "image") {
    const src = rasterNeedsThumb(file) ? file.thumbUrl || file.fileUrl : file.fileUrl;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={file.originalName} className="max-h-[85vh] w-full rounded-xl bg-white object-contain" />
    );
  }
  if (file.preview === "pdf") {
    return (
      <div className="space-y-3">
        <iframe title={file.originalName} src={file.fileUrl} className="h-[55vh] w-full rounded-xl bg-white sm:h-[85vh]" />
        {dl ? (
          <a href={dl} className="inline-block rounded-xl bg-navy px-4 py-2.5 text-sm font-semibold text-white">
            Скачать / открыть PDF
          </a>
        ) : null}
      </div>
    );
  }
  if (file.preview === "docx") {
    return <DocxPreview src={file.fileUrl} />;
  }
  if (file.preview === "video") {
    return (
      <video
        src={file.fileUrl}
        poster={file.thumbUrl || undefined}
        controls
        playsInline
        className="max-h-[85vh] w-full rounded-xl bg-black"
      >
        <track kind="captions" />
      </video>
    );
  }
  if (file.preview === "audio") {
    return (
      <div className="rounded-xl bg-[#ece7de] px-6 py-10">
        <p className="mb-4 text-center font-serif text-xl text-navy">{file.originalName}</p>
        <audio src={file.fileUrl} controls className="w-full" />
      </div>
    );
  }
  if (file.preview === "model3d") {
    return <ModelPreview src={file.previewUrl || file.fileUrl} tall className="h-[85vh] overflow-hidden rounded-xl" />;
  }
  return (
    <div className="rounded-xl border border-dashed border-line bg-white px-6 py-12 text-center">
      <p className="font-serif text-xl text-navy">Скачайте файл, чтобы открыть</p>
      {dl ? (
        <a href={dl} className="mt-4 inline-block rounded-xl bg-navy px-4 py-2.5 text-sm font-semibold text-white">
          Скачать {file.originalName}
        </a>
      ) : null}
    </div>
  );
}

export function LibraryViewer({ item, allowDownload = true }: { item: LibraryCard; allowDownload?: boolean }) {
  const files = item.files && item.files.length > 0 ? item.files : null;
  const [active, setActive] = useState(0);
  if (!files) {
    return (
      <FileView
        allowDownload={allowDownload}
        file={{ id: item.id, originalName: item.originalName, mimeType: item.mimeType, preview: item.preview, fileUrl: item.fileUrl, thumbUrl: item.thumbUrl }}
      />
    );
  }
  const file = files[Math.min(active, files.length - 1)];
  return (
    <div className="min-w-0 space-y-3">
      <FileView file={file} allowDownload={allowDownload} />
      {files.length > 1 ? (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {files.map((f, i) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setActive(i)}
              className={`overflow-hidden rounded-lg border ${i === active ? "border-gold" : "border-line"}`}
              title={f.originalName}
            >
              {f.thumbUrl || f.preview === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.thumbUrl || f.fileUrl} alt="" className="h-16 w-full object-cover" />
              ) : (
                <div className="flex h-16 items-center justify-center bg-[#ece7de] px-1 text-[10px] font-semibold text-navy">
                  {f.originalName.split(".").pop()?.toUpperCase()}
                </div>
              )}
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-semibold text-navy">{file.originalName}</span>
        {allowDownload ? (
          <a href={downloadHref(file.fileUrl)} className="font-semibold text-navy underline">
            Скачать
          </a>
        ) : null}
      </div>
    </div>
  );
}
