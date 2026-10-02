"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";

export function NewFolder({ parentId }: { parentId?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/library/folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, parentId: parentId || "" }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Не удалось создать папку");
      return;
    }
    setTitle("");
    setOpen(false);
    router.push(data.id ? `/library?folder=${data.id}` : "/library");
    router.refresh();
  }

  if (!open) {
    return (
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        Новая папка
      </Button>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Название папки"
        className="rounded-xl border border-line bg-white px-3 py-2.5 text-[15px]"
        required
      />
      <Button type="submit" disabled={busy}>
        Создать
      </Button>
      <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
        Отмена
      </Button>
      {error ? <span className="text-sm text-bad">{error}</span> : null}
    </form>
  );
}
