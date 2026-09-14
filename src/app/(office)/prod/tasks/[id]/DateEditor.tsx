"use client";

import { useState } from "react";
import { Button, ErrorText, Field, Input } from "@/components/ui";

export function DateEditor({
  id,
  dueAt,
  startedLabel,
}: {
  id: string;
  dueAt: string;
  startedLabel?: string;
}) {
  const [due, setDue] = useState(dueAt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/prod/tasks/${id}/dates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dueAt: due || null }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) setError(data.error || "Ошибка");
    else window.location.reload();
  }

  return (
    <div className="mt-4 space-y-3 rounded-xl border border-line bg-white p-3">
      <p className="text-sm font-semibold text-navy">Дедлайн</p>
      {startedLabel ? <p className="text-xs text-muted">{startedLabel}</p> : (
        <p className="text-xs text-muted">Начало проставится само, когда исполнитель нажмёт «В работу».</p>
      )}
      <ErrorText>{error}</ErrorText>
      <Field label="Сдать до">
        <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
      </Field>
      <Button disabled={busy} variant="secondary" onClick={() => void save()}>
        Сохранить дедлайн
      </Button>
    </div>
  );
}
