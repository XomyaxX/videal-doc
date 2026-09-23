"use client";

import { useState } from "react";
import { Button, ErrorText, Textarea } from "@/components/ui";

export function BriefBlock({
  title = "ТЗ / описание",
  text,
  hint,
  canEdit,
  saveUrl,
  field = "brief",
  method = "POST",
}: {
  title?: string;
  text: string;
  hint?: string;
  canEdit: boolean;
  saveUrl: string;
  field?: string;
  method?: "POST" | "PUT";
}) {
  const [open, setOpen] = useState(!text && canEdit);
  const [value, setValue] = useState(text);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    const res = await fetch(saveUrl, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Не сохранилось");
      return;
    }
    window.location.reload();
  }

  return (
    <div className="rounded-2xl border border-line bg-white px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-serif text-lg text-navy">{title}</h2>
        {canEdit && !open ? (
          <button type="button" className="text-sm font-semibold text-navy underline" onClick={() => setOpen(true)}>
            {text ? "Править" : "Написать"}
          </button>
        ) : null}
      </div>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
      {open && canEdit ? (
        <div className="mt-3 space-y-2">
          <Textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="min-h-[160px]"
            placeholder="Что сделать, как должно выглядеть, ограничения, референсы"
          />
          <ErrorText>{error}</ErrorText>
          <div className="flex gap-2">
            <Button disabled={busy} onClick={() => void save()}>
              Сохранить
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setOpen(Boolean(!text && canEdit));
                setValue(text);
              }}
            >
              Отмена
            </Button>
          </div>
        </div>
      ) : text ? (
        <p className="mt-2 whitespace-pre-wrap text-[15px] leading-6 text-navy">{text}</p>
      ) : (
        <p className="mt-2 text-sm text-muted">Пока нет — руководитель напишет, что нужно сделать.</p>
      )}
    </div>
  );
}
