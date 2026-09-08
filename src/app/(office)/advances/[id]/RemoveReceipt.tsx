"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RemoveReceipt({ reportId, receiptId }: { reportId: string; receiptId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!confirm("Убрать эту позицию из отчёта? Скан с диска не удалится.")) return;
    setBusy(true);
    const res = await fetch(`/api/advances/${reportId}/receipts/${receiptId}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      alert(data.error || "Не удалось убрать");
      return;
    }
    router.refresh();
  }

  return (
    <button
      type="button"
      className="text-xs font-semibold text-muted hover:text-bad"
      disabled={busy}
      onClick={() => void remove()}
    >
      {busy ? "…" : "убрать"}
    </button>
  );
}
