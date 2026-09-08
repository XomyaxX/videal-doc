"use client";

import { useState } from "react";
import { Button, ErrorText, Field, Select, Textarea } from "@/components/ui";

export function TaskPanel({
  id,
  status,
  canLead,
  people,
  assigneeId,
}: {
  id: string;
  status: string;
  canLead: boolean;
  people: { id: string; name: string }[];
  assigneeId: string;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [who, setWho] = useState(assigneeId);

  async function act(next: string, extra?: Record<string, string>) {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/prod/tasks/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next, comment: note, ...extra }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) setError(data.error || "Ошибка");
    else window.location.reload();
  }

  async function upload(file: File) {
    setBusy(true);
    setError("");
    const fd = new FormData();
    fd.set("file", file);
    const res = await fetch(`/api/prod/tasks/${id}/files`, { method: "POST", body: fd });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) setError(data.error || "Ошибка загрузки");
    else window.location.reload();
  }

  return (
    <div className="space-y-4">
      <ErrorText>{error}</ErrorText>
      <div className="flex flex-wrap gap-2">
        {status !== "wip" && (
          <Button disabled={busy} onClick={() => act("wip")}>
            В работу
          </Button>
        )}
        <Button disabled={busy} variant="gold" onClick={() => act("done")}>
          Сдать
        </Button>
        <Button disabled={busy} variant="secondary" onClick={() => act("blocked", { blockedReason: note })}>
          Ждём
        </Button>
        {canLead ? (
          <>
            <Button disabled={busy} variant="gold" onClick={() => act("approved")}>
              Утвердить
            </Button>
            <Button disabled={busy} variant="danger" onClick={() => act("revise", { comment: note })}>
              На правки
            </Button>
          </>
        ) : null}
      </div>
      <Field label="Почему ждём / правки" hint="Для кнопок «Ждём» и «На правки». Обычный комментарий — в блоке «Комментарии».">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <Field label="Плейбласт или превью" hint="mp4, png, jpg, pdf. Blend — только ссылкой на шаре.">
        <input
          type="file"
          accept=".mp4,.webm,.mov,.png,.jpg,.jpeg,.webp,.pdf,.gif"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
        />
      </Field>
      {canLead ? (
        <Field label="Исполнитель">
          <div className="flex gap-2">
            <Select value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="">не назначен</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => act(status, { assigneeId: who })}
            >
              Назначить
            </Button>
          </div>
        </Field>
      ) : null}
    </div>
  );
}
