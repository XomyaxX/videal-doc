"use client";

import { useEffect } from "react";

export function Viewer({ fileId, docId }: { fileId: string; docId: string }) {
  useEffect(() => {
    fetch(`/api/documents/${docId}/view`, { method: "POST" });
  }, [docId]);
  return (
    <iframe title="Просмотр" src={`/api/files/${fileId}`} className="h-[70vh] w-full rounded-xl bg-white" />
  );
}
