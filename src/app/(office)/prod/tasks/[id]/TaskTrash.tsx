"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ErrorText } from "@/components/ui";

export function TaskTrash({
  id,
  deleted,
  compact,
}: {
  id: string;
  deleted: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function act(action: "hide" | "restore") {
    if (action === "hide" && !confirm("Убрать задачу из пайплайна и списков? Файлы на диске останутся, потом можно восстановить.")) {
      return;
    }
    setBusy(true);
    setError("");
    const res = await fetch(`/api/prod/tasks/${id}/trash`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Не удалось");
      return;
    }
    if (action === "hide") router.push("/prod/trash");
    else router.refresh();
  }

  if (compact) {
    return (
      <button
        type="button"
        disabled={busy}
        className="text-sm font-semibold text-gold hover:underline disabled:opacity-50"
        onClick={() => void act("restore")}
      >
        {busy ? "…" : "восстановить"}
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <ErrorText>{error}</ErrorText>
      {deleted ? (
        <Button disabled={busy} onClick={() => void act("restore")}>
          {busy ? "Возвращаем…" : "Восстановить задачу"}
        </Button>
      ) : (
        <Button variant="danger" disabled={busy} onClick={() => void act("hide")}>
          {busy ? "Убираем…" : "Удалить задачу"}
        </Button>
      )}
    </div>
  );
}
