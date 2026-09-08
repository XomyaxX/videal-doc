"use client";

import { useState } from "react";
import { Button, ErrorText } from "@/components/ui";

export function QuickTask({ id, status }: { id: string; status: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function act(next: string) {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/prod/tasks/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next, comment: next === "done" ? "сдал с карточки" : "" }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) setError(data.error || "Ошибка");
    else window.location.reload();
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {status !== "wip" ? (
        <Button disabled={busy} onClick={() => act("wip")}>
          В работу
        </Button>
      ) : null}
      {status === "wip" || status === "revise" ? (
        <Button disabled={busy} variant="gold" href={`/prod/tasks/${id}`}>
          Сдать
        </Button>
      ) : null}
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
