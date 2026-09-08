"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteLibraryFile({
  itemId,
  fileId,
  name,
  last,
}: {
  itemId: string;
  fileId: string;
  name: string;
  last: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    const msg = last
      ? `«${name}» — последний файл в блоке. Убрать его — скрыть весь блок. С диска он не удалится.`
      : `Убрать «${name}» из блока? С диска файл не удалится.`;
    if (!confirm(msg)) return;
    setBusy(true);
    const res = await fetch(`/api/library/${itemId}/file/${fileId}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      alert(data.error || "Не удалось убрать файл");
      return;
    }
    if (data.hidden) router.push("/library");
    else router.refresh();
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={remove}
      className="shrink-0 text-xs font-semibold text-muted hover:text-bad disabled:opacity-50"
    >
      {busy ? "…" : "убрать"}
    </button>
  );
}
