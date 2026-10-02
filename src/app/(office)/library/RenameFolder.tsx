"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RenameFolder({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch(`/api/library/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: value }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Не удалось переименовать");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" className="text-xs font-semibold text-navy underline" onClick={() => setOpen(true)}>
        Переименовать
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="min-w-[10rem] flex-1 rounded-lg border border-line bg-white px-2 py-1 text-sm"
        required
      />
      <button type="submit" disabled={busy} className="text-xs font-semibold text-gold underline">
        Сохранить
      </button>
      <button type="button" className="text-xs font-semibold text-muted underline" onClick={() => setOpen(false)}>
        Отмена
      </button>
      {error ? <span className="text-xs text-bad">{error}</span> : null}
    </form>
  );
}
