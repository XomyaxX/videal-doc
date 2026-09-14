"use client";

import { useState } from "react";
import { Button, ErrorText, Input } from "@/components/ui";

export function TaskRename({
  id,
  title,
  fallback,
}: {
  id: string;
  title: string;
  fallback: string;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(title || fallback);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/prod/tasks/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: value.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) setError(data.error || "Не переименовалось");
    else window.location.reload();
  }

  if (!open) {
    return (
      <button type="button" className="mb-4 text-sm font-semibold text-navy underline" onClick={() => setOpen(true)}>
        Переименовать задачу
      </button>
    );
  }

  return (
    <div className="mb-4 flex max-w-xl flex-wrap items-end gap-2">
      <div className="min-w-0 flex-1">
        <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={fallback} />
        <ErrorText>{error}</ErrorText>
      </div>
      <Button disabled={busy} onClick={() => void save()}>
        Сохранить
      </Button>
      <Button variant="secondary" disabled={busy} onClick={() => setOpen(false)}>
        Отмена
      </Button>
    </div>
  );
}
