"use client";

import { useEffect, useState } from "react";
import { Button, Card, ErrorText, Field, Input } from "@/components/ui";
import { safeNext } from "@/lib/origin";

function afterOk() {
  const next = safeNext(new URLSearchParams(window.location.search).get("next"));
  window.location.href = next || "/";
}

export function VerifyForm({ preferDigits = false }: { preferDigits?: boolean }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [digits, setDigits] = useState(preferDigits);
  const [qr, setQr] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [expiresAt, setExpiresAt] = useState(0);
  const [left, setLeft] = useState(0);

  async function loadQr() {
    const res = await fetch("/api/auth/2fa/challenge", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Не удалось показать квадрат");
      return;
    }
    setQr(data.qr || "");
    setChallengeId(data.id || "");
    setExpiresAt(Date.parse(data.expiresAt) || 0);
    setError("");
  }

  useEffect(() => {
    if (!digits) void loadQr();
  }, [digits]);

  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => setLeft(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, [expiresAt]);

  useEffect(() => {
    if (!challengeId || digits) return;
    const t = setInterval(async () => {
      const res = await fetch(`/api/auth/2fa/challenge/${challengeId}`);
      const data = await res.json().catch(() => ({}));
      if (data.status === "ok") afterOk();
      if (data.status === "denied") setError("Вход отклонили с телефона");
      if (data.status === "expired") void loadQr();
    }, 1500);
    return () => clearInterval(t);
  }, [challengeId, digits]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/auth/2fa/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Неверный код");
      return;
    }
    afterOk();
  }

  return (
    <Card className="w-full max-w-md">
      <h1 className="font-serif text-2xl text-navy">Подтвердите вход</h1>
      <p className="mt-1 text-sm text-muted">
        Наведите камеру телефона на квадрат — откроется Видеал.Док, нажмите «Это я». Или введите 6 цифр из Яндекс Ключа.
      </p>
      {error ? <div className="mt-3"><ErrorText>{error}</ErrorText></div> : null}

      {!digits ? (
        <div className="mt-4">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="QR для входа" className="mx-auto rounded-xl border border-line bg-white p-2" />
          ) : (
            <p className="text-center text-sm text-muted">Готовим квадрат…</p>
          )}
          <p className="mt-2 text-center text-sm text-muted">
            {left > 0 ? `Обновится через ${left} с` : "Обновляем…"}
          </p>
          <button type="button" className="mt-3 w-full text-center text-sm text-navy underline" onClick={() => void loadQr()}>
            Новый квадрат
          </button>
          <button type="button" className="mt-2 w-full text-center text-sm text-muted underline" onClick={() => setDigits(true)}>
            Ввести код вручную
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-5 space-y-3">
          <Field label="Код">
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              required
            />
          </Field>
          <Button type="submit" className="w-full" disabled={busy || code.length !== 6}>
            {busy ? "Проверяем…" : "Войти"}
          </Button>
          <button type="button" className="w-full text-center text-sm text-muted underline" onClick={() => setDigits(false)}>
            Сканировать квадрат
          </button>
        </form>
      )}
    </Card>
  );
}
