"use client";

import { useState } from "react";
import { Button, ErrorText, Field, Textarea } from "@/components/ui";

export function StatementActions({
  id,
  status,
  isAuthor,
  isManager,
}: {
  id: string;
  status: string;
  isAuthor: boolean;
  isManager: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  async function act(action: string) {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/hrdocs/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, note }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) setError(data.error || "Ошибка");
    else window.location.reload();
  }

  return (
    <div className="space-y-3">
      <ErrorText>{error}</ErrorText>
      {isAuthor && ["draft", "signed", "rework"].includes(status) ? (
        <>
          <p className="text-sm text-muted">
            {status === "rework"
              ? "Исправьте заявление и снова отправьте руководителю."
              : "Черновик ещё не у руководителя."}
          </p>
          <Button disabled={busy} onClick={() => act("submit")}>
            Отправить на согласование
          </Button>
        </>
      ) : null}
      {isAuthor && status === "review" ? (
        <p className="text-sm text-muted">
          Заявление у руководителя. Распечатать, подписать и передать нужно после согласования.
        </p>
      ) : null}
      {isAuthor && status === "accepted" ? (
        <p className="text-sm">Согласовано. Распечатайте PDF, подпишите и передайте руководителю.</p>
      ) : null}
      {isAuthor && status === "rejected" ? (
        <p className="text-sm text-muted">Руководитель отклонил заявление.</p>
      ) : null}
      {isManager && status === "review" ? (
        <>
          <Field label="Комментарий">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} variant="gold" onClick={() => act("accept")}>
              Согласовать
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
