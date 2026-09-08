"use client";

import { useState } from "react";
import { Button, ErrorText } from "@/components/ui";

export function EmployeeActions({ id, status }: { id: string; status: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function act(action: string) {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/requests/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) setError(data.error || "Ошибка");
    else window.location.reload();
  }
  return (
    <div className="space-y-3">
      <ErrorText>{error}</ErrorText>
      {["draft", "rework"].includes(status) ? (
        <Button disabled={busy} onClick={() => act("submit")}>
          Отправить в АХО
        </Button>
      ) : null}
      {status === "submitted" ? (
        <Button disabled={busy} variant="secondary" onClick={() => act("withdraw")}>
          Отозвать
        </Button>
      ) : null}
      {status === "draft" ? (
        <p className="text-sm text-muted">Черновик виден только вам, пока не отправите.</p>
      ) : (
        <p className="text-sm text-muted">Сумму и дату ставит АХО. Вы получите уведомление, когда закупят.</p>
      )}
    </div>
  );
}
