"use client";

import { useState } from "react";
import { Button, Field, Input, Textarea } from "@/components/ui";

export function AdvancePanel({
  id,
  status,
  purpose,
  issued,
  canEdit,
  canApprove,
  accountantEmail,
}: {
  id: string;
  status: string;
  purpose: string;
  issued: string;
  canEdit: boolean;
  canApprove: boolean;
  accountantEmail: string;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  async function act(action: string) {
    if (busy) return;
    setBusy(true);
    const res = await fetch(`/api/advances/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, note }),
    });
    const data = await res.json();
    if (!res.ok) {
      setBusy(false);
      alert(data.error);
      return;
    }
    if (data.mailError) alert(`Отчёт в Доке отправлен, но письмо не ушло: ${data.mailError}`);
    else if (data.mailed) alert(`Отправлено бухгалтеру на почту ${data.to}`);
    window.location.reload();
  }
  return (
    <div className="space-y-4">
      {canEdit ? (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            await fetch(`/api/advances/${id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ purpose: fd.get("purpose"), issuedAmount: fd.get("issuedAmount") }),
            });
            window.location.reload();
          }}
        >
          <Field label="Назначение">
            <Input name="purpose" defaultValue={purpose} />
          </Field>
          <Field label="Получено под отчёт, ₽">
            <Input name="issuedAmount" defaultValue={issued} />
          </Field>
          <Button type="submit" variant="secondary">
            Сохранить
          </Button>
        </form>
      ) : (
        <p>
          <span className="text-muted">Назначение: </span>
          {purpose || "—"}
        </p>
      )}

      <Button href={`/api/advances/${id}/pdf`} variant="gold">
        Скачать PDF (АО-1)
      </Button>
      <Button href={`/api/advances/${id}/xlsx`} variant="secondary">
        Скачать Excel (АО-1)
      </Button>

      {canEdit ? (
        <div className="space-y-2">
          <Button className="w-full" disabled={busy} onClick={() => act("submit")}>
            Отправить бухгалтеру
          </Button>
          <Button className="w-full" variant="secondary" disabled={busy} onClick={() => act("submit-mail")}>
            {busy ? "Отправляем…" : "Отправить бухгалтеру на почту"}
          </Button>
          {accountantEmail ? (
            <p className="text-xs text-muted">Письмо уйдёт на {accountantEmail} с вашего ящика — АО-1 и сканы чеков.</p>
          ) : null}
        </div>
      ) : null}

      {canApprove && status === "review" ? (
        <div className="space-y-2 rounded-xl bg-paper p-3">
          <Field label="Комментарий бухгалтера">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div className="flex gap-2">
            <Button onClick={() => act("review-ok")}>Проверено, на утверждение</Button>
            <Button variant="danger" onClick={() => act("rework")}>
              На доработку
            </Button>
          </div>
        </div>
      ) : null}

      {canApprove && status === "approve" ? (
        <div className="space-y-2 rounded-xl bg-paper p-3">
          <Field label="Комментарий руководителя">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <Button onClick={() => act("accept")}>Утвердить</Button>
        </div>
      ) : null}
    </div>
  );
}
