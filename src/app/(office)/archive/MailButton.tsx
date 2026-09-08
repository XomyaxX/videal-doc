"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

export function MailButton({ id, mailed }: { id: string; mailed: boolean }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(mailed ? "уже отправляли" : "");

  async function send() {
    setBusy(true);
    setMsg("");
    const res = await fetch(`/api/archive/${id}/mail`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error || "Не отправилось");
      return;
    }
    setMsg(data.to ? `отправлено на ${data.to}` : "отправлено");
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Button type="button" variant="secondary" disabled={busy} onClick={send} className="px-3 py-1.5 text-sm">
        {busy ? "Отправляем…" : "На почту"}
      </Button>
      {msg ? <span className="text-xs text-muted">{msg}</span> : null}
    </span>
  );
}
