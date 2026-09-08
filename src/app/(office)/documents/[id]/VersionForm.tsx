"use client";

import { useState } from "react";
import { Button, ErrorText, Field, Input } from "@/components/ui";

export function VersionForm({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch(`/api/documents/${id}/version`, { method: "POST", body: new FormData(e.currentTarget) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Не удалось обновить");
      return;
    }
    window.location.reload();
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <ErrorText>{error}</ErrorText>
      <Field label="Новый файл" hint="Старый останется в истории. Ознакомление и подписи сбросятся — людям придёт уведомление.">
        <Input name="file" type="file" required />
      </Field>
      <Field label="Что изменилось">
        <Input name="note" placeholder="Исправили пункт 3" />
      </Field>
      <Button type="submit" variant="secondary" disabled={busy}>
        {busy ? "…" : "Выложить версию"}
      </Button>
    </form>
  );
}
