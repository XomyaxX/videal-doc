"use client";

import { useState } from "react";
import { Button, Card, ErrorText, Field, Input } from "@/components/ui";

export default function ChangePasswordPage() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/auth/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current, next }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Ошибка");
      return;
    }
    window.location.href = "/";
  }

  return (
    <div className="flex min-h-full items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <h1 className="font-serif text-2xl text-navy">Смените пароль</h1>
        <p className="mt-1 text-muted">При первом входе нужно задать свой пароль — не короче 10 символов.</p>
        <form onSubmit={submit} className="mt-5 space-y-3">
          <ErrorText>{error}</ErrorText>
          <Field label="Текущий пароль">
            <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
          </Field>
          <Field label="Новый пароль">
            <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} minLength={10} required />
          </Field>
          <Button type="submit" className="w-full" disabled={busy}>
            Сохранить и продолжить
          </Button>
        </form>
      </Card>
    </div>
  );
}
