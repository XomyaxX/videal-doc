"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, ErrorText, Field, Input } from "@/components/ui";

export function GuestJoinForm({
  token,
  title,
  canJoin,
  recordConsent,
}: {
  token: string;
  title: string;
  canJoin: boolean;
  recordConsent: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [ok, setOk] = useState(!recordConsent);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function go() {
    setBusy(true);
    setErr("");
    const res = await fetch("/api/meet/guest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, name }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setErr(data.error || "Не вышло");
      return;
    }
    router.push(`/meet/join/${token}/room`);
  }

  return (
    <Card>
      <p className="text-sm text-muted">Видеаль.Док · гостевой созвон</p>
      <h1 className="mt-1 font-serif text-3xl text-navy">{title}</h1>
      <p className="mt-2 text-sm text-muted">Регистрация не нужна. Напишите, как к вам обращаться.</p>
      {!canJoin ? (
        <p className="mt-4 text-sm text-muted">Созвон ещё не начался. Обновите страницу, когда организатор откроет комнату.</p>
      ) : (
        <div className="mt-4 space-y-3">
          <Field label="Фамилия и имя">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Иванов Иван" autoComplete="name" />
          </Field>
          {recordConsent ? (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={ok} onChange={(e) => setOk(e.target.checked)} />
              Согласен на запись совещания
            </label>
          ) : null}
          <ErrorText>{err}</ErrorText>
          <Button disabled={busy || !ok} onClick={() => void go()}>
            Войти в созвон
          </Button>
        </div>
      )}
    </Card>
  );
}
