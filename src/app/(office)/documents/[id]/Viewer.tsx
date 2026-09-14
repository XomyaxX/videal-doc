"use client";

export function Viewer({ fileId }: { fileId: string; docId?: string }) {
  return (
    <iframe title="Просмотр" src={`/api/files/${fileId}`} className="h-[70vh] w-full rounded-xl bg-white md:h-[70vh] min-h-[50vh]" />
  );
}
