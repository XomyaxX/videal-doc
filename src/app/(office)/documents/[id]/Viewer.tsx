"use client";

import { DocxPreview } from "@/components/DocxPreview";
import type { PreviewKind } from "@/lib/library-kinds";

export function Viewer({ fileId, kind }: { fileId: string; kind?: PreviewKind; docId?: string }) {
  const src = `/api/files/${fileId}`;
  if (kind === "docx") {
    return <DocxPreview src={src} className="h-[70vh] min-h-[50vh]" />;
  }
  if (kind === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" className="max-h-[70vh] w-full rounded-xl bg-white object-contain" />
    );
  }
  return (
    <iframe title="Просмотр" src={src} className="h-[70vh] w-full rounded-xl bg-white md:h-[70vh] min-h-[50vh]" />
  );
}
