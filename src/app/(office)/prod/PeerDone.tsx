"use client";

import { useState } from "react";
import { Button, ErrorText } from "@/components/ui";

export function PeerDone({ id, status }: { id: string; status: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function act(next: string) {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/peer-tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) setError(data.error || "Ошибка");
    else window.location.reload();
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {status !== "done" ? (
        <Button disabled={busy} onClick={() => void act("done")}>
          Готово
        </Button>
      ) : (
        <Button disabled={busy} variant="secondary" onClick={() => void act("todo")}>
          Вернуть
        </Button>
      )}
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
