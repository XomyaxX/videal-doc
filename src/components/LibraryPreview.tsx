"use client";

import { useState } from "react";
import { LIBRARY_KIND_LABEL } from "@/lib/library-kinds";

export type LibraryFileCard = {
  id: string;
  originalName: string;
  mimeType: string;
  uncPath?: string;
  preview: "image" | "pdf" | "video" | "none";
  fileUrl: string;
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
  preview: "image" | "pdf" | "video" | "none";
  thumbUrl: string;
  fileUrl: string;
  href: string;
  fileCount?: number;
  files?: LibraryFileCard[];
};

export function LibraryThumb({ item, className = "" }: { item: LibraryCard; className?: string }) {
  if (item.thumbUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={item.thumbUrl} alt={item.title} className={`object-cover ${className}`} />
    );
  }
  return (
    <div className={`flex items-center justify-center bg-[#ece7de] text-sm font-semibold text-navy ${className}`}>
      {item.kindLabel || LIBRARY_KIND_LABEL[item.kind] || item.kind}
    </div>
  );
}

function FileView({ file }: { file: LibraryFileCard }) {
  if (file.preview === "image" || file.thumbUrl) {
    const src = file.preview === "image" ? file.fileUrl : file.thumbUrl || file.fileUrl;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={file.originalName} className="max-h-[70vh] w-full rounded-xl bg-white object-contain" />
    );
  }
  if (file.preview === "pdf") {
    return <iframe title={file.originalName} src={file.fileUrl} className="h-[70vh] w-full rounded-xl bg-white" />;
  }
  if (file.preview === "video") {
    return (
      <video src={file.fileUrl} controls className="max-h-[70vh] w-full rounded-xl bg-black">
        <track kind="captions" />
      </video>
    );
  }
  return (
    <div className="rounded-xl border border-dashed border-line bg-white px-6 py-12 text-center">
      <p className="font-serif text-xl text-navy">В браузере этот файл не открыть</p>
      <a href={file.fileUrl} className="mt-4 inline-block font-semibold text-navy underline">
        Скачать {file.originalName}
      </a>
    </div>
  );
}

export function LibraryViewer({ item }: { item: LibraryCard }) {
  const files = item.files && item.files.length > 0 ? item.files : null;
  const [active, setActive] = useState(0);
  if (!files) {
    return <FileView file={{ id: item.id, originalName: item.originalName, mimeType: item.mimeType, preview: item.preview, fileUrl: item.fileUrl, thumbUrl: item.thumbUrl }} />;
  }
  const file = files[Math.min(active, files.length - 1)];
  return (
    <div className="space-y-3">
      <FileView file={file} />
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
        <a href={file.fileUrl} className="font-semibold text-navy underline">
          Скачать
        </a>
      </div>
    </div>
  );
}
