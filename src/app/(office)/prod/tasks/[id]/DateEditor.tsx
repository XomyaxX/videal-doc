"use client";

import { useState } from "react";
import { Button, ErrorText, Field, Input } from "@/components/ui";

export function DateEditor({
  id,
  startsAt,
  dueAt,
}: {
  id: string;
  startsAt: string;
  dueAt: string;
}) {
  const [start, setStart] = useState(startsAt);
  const [due, setDue] = useState(dueAt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/prod/tasks/${id}/dates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startsAt: start || null, dueAt: due || null }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) setError(data.error || "Ошибка");
    else window.location.reload();
  }

  return (
    <div className="mt-4 space-y-3 rounded-xl border border-line bg-white p-3">
      <p className="text-sm font-semibold text-navy">Срок задачи</p>
      <ErrorText>{error}</ErrorText>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Начало">
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="Окончание">
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
      </div>
      <Button disabled={busy} variant="secondary" onClick={() => void save()}>
        Сохранить даты
      </Button>
    </div>
  );
}
