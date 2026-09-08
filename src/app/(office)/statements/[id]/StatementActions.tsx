"use client";

import { useState } from "react";
import { Button, ErrorText, Field, Textarea } from "@/components/ui";

export function StatementActions({
  id,
  status,
  signedFileId,
  isAuthor,
  isManager,
}: {
  id: string;
  status: string;
  signedFileId: string;
  isAuthor: boolean;
  isManager: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  async function act(action: string, extra?: Record<string, string>) {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/hrdocs/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, note, ...extra }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) setError(data.error || "Ошибка");
    else window.location.reload();
  }

  async function upload(file: File) {
    const fd = new FormData();
    fd.set("file", file);
    const up = await fetch("/api/upload", { method: "POST", body: fd });
    const data = await up.json();
    if (!up.ok) {
      setError(data.error || "Не удалось загрузить скан");
      return;
    }
    await act("attach", { fileId: data.id });
  }

  return (
    <div className="space-y-3">
      <ErrorText>{error}</ErrorText>
      {isAuthor && ["draft", "signed", "rework"].includes(status) ? (
        <Field label="Подписанный скан" hint="Распечатайте PDF, подпишите, приложите фото или pdf">
          <input
            type="file"
            accept=".jpg,.jpeg,.png,.webp,.pdf"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
            }}
          />
        </Field>
      ) : null}
      {isAuthor && status === "signed" ? (
        <Button disabled={busy} onClick={() => act("submit")}>
          Отправить руководителю
        </Button>
      ) : null}
      {isAuthor && status === "draft" ? (
        <p className="text-sm text-muted">Сначала печать и скан с подписью — без этого отправить нельзя.</p>
      ) : null}
      {isManager && status === "review" ? (
        <>
          <Field label="Комментарий">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} variant="gold" onClick={() => act("accept")}>
              Принять
            </Button>
            <Button disabled={busy} variant="secondary" onClick={() => act("rework")}>
              Вернуть
            </Button>
            <Button disabled={busy} variant="danger" onClick={() => act("reject")}>
              Отклонить
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
