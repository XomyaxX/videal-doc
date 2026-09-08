"use client";

import { useEffect, useState } from "react";
import { Button, Card, ErrorText, Field, Input } from "@/components/ui";

export function SetupForm() {
  const [qr, setQr] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch("/api/auth/2fa/setup")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else {
          setQr(d.qr || "");
          setSecret(d.secret || "");
        }
      });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/auth/2fa/confirm", {
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
    const next = new URLSearchParams(window.location.search).get("next");
    window.location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  }

  return (
    <Card className="w-full max-w-md">
      <h1 className="font-serif text-2xl text-navy">Привяжите приложение</h1>
      <p className="mt-1 text-sm text-muted">
        Для этой учётки нужен код. Откройте Яндекс Ключ, Google Authenticator или 2FA в паролях телефона, сканируйте
        квадрат.
      </p>
      {qr ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qr} alt="QR для приложения" className="mx-auto mt-4 rounded-xl border border-line bg-white p-2" />
      ) : (
        <p className="mt-4 text-sm text-muted">Готовим код…</p>
      )}
      {secret ? (
        <p className="mt-2 break-all text-center font-mono text-xs text-muted">
          Если камера не берёт: {secret}
        </p>
      ) : null}
      <form onSubmit={submit} className="mt-4 space-y-3">
        <ErrorText>{error}</ErrorText>
        <Field label="Код из приложения">
          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            required
          />
        </Field>
        <Button type="submit" className="w-full" disabled={busy || code.length !== 6}>
          {busy ? "Проверяем…" : "Включить"}
        </Button>
      </form>
    </Card>
  );
}
