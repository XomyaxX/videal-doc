"use client";

import { useState } from "react";

export function ShareLink({
  itemId,
  enabled,
  token,
}: {
  itemId: string;
  enabled: boolean;
  token: string;
}) {
  const [on, setOn] = useState(enabled);
  const [tok, setTok] = useState(token);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  function urlOf(t: string) {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/l/${t}`;
  }

  async function toggle(next: boolean) {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/library/${itemId}/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: next }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Не удалось");
      return;
    }
    setOn(Boolean(data.shareEnabled));
    setTok(data.shareToken || "");
  }

  async function copy() {
    if (!tok) return;
    await navigator.clipboard.writeText(urlOf(tok));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="mt-2 space-y-1" onClick={(e) => e.preventDefault()}>
      {on && tok ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="text-xs font-semibold text-gold underline"
            onClick={() => void copy()}
            disabled={busy}
          >
            {copied ? "Скопировано" : "Копировать ссылку"}
          </button>
          <button type="button" className="text-xs font-semibold text-muted underline" onClick={() => void toggle(false)} disabled={busy}>
            Выключить
          </button>
        </div>
      ) : (
        <button type="button" className="text-xs font-semibold text-navy underline" onClick={() => void toggle(true)} disabled={busy}>
          Ссылка для просмотра
        </button>
      )}
      {error ? <p className="text-xs text-bad">{error}</p> : null}
    </div>
  );
}
