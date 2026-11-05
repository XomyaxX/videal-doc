"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DayTimeEdit({
  userId,
  ymd,
  inHm,
  outHm,
}: {
  userId: string;
  ymd: string;
  inHm: string;
  outHm: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [inn, setInn] = useState(inHm);
  const [out, setOut] = useState(outHm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!open) {
    return (
      <button
        type="button"
        className="mt-0.5 block text-[11px] font-semibold text-gold hover:underline"
        aria-label={`Править отметку за ${ymd}`}
        data-user={userId}
        data-ymd={ymd}
        onClick={() => {
          setInn(inHm);
          setOut(outHm);
          setError("");
          setOpen(true);
        }}
      >
        править
      </button>
    );
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const payload: { userId: string; ymd: string; inAt?: string | null; outAt?: string | null } = { userId, ymd };
    if (inn !== inHm) payload.inAt = inn || null;
    if (out !== outHm) payload.outAt = out || null;
    if (payload.inAt === undefined && payload.outAt === undefined) {
      setOpen(false);
      return;
    }
    setBusy(true);
    setError("");
    const res = await fetch("/api/presence/control", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Не сохранилось");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <form onSubmit={(e) => void save(e)} className="mt-1 w-[4.75rem] space-y-1">
      <label className="block text-[11px] text-muted">
        приход
        <input
          type="text"
          inputMode="numeric"
          placeholder="09:00"
          autoComplete="off"
          maxLength={5}
          value={inn}
          onChange={(e) => setInn(e.target.value)}
          className="mt-0.5 block w-full rounded border border-line bg-white px-1 py-0.5 font-mono text-[11px] text-navy"
        />
      </label>
      <label className="block text-[11px] text-muted">
        уход
        <input
          type="text"
          inputMode="numeric"
          placeholder="18:00"
          autoComplete="off"
          maxLength={5}
          value={out}
          onChange={(e) => setOut(e.target.value)}
          className="mt-0.5 block w-full rounded border border-line bg-white px-1 py-0.5 font-mono text-[11px] text-navy"
        />
      </label>
      <p className="text-[10px] leading-snug text-muted">Пусто — стереть. Время омское.</p>
      {error ? <p className="text-[11px] text-bad">{error}</p> : null}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="text-[11px] font-semibold text-navy underline disabled:opacity-60">
          {busy ? "…" : "сохранить"}
        </button>
        <button type="button" className="text-[11px] text-muted" onClick={() => setOpen(false)} disabled={busy}>
          отмена
        </button>
      </div>
    </form>
  );
}
