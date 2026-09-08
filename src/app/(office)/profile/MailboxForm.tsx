"use client";

import { useState } from "react";
import { Button, Card, Field, Input } from "@/components/ui";

export function MailboxForm({ email, hasPassword }: { email: string; hasPassword: boolean }) {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(hasPassword);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/profile/mail", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: fd.get("email"),
        smtpPassword: fd.get("smtpPassword"),
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error || "Не удалось сохранить");
      return;
    }
    setConnected(Boolean(data.hasPassword));
    setMsg("Сохранено");
  }

  async function test() {
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/profile/mail", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "test" }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error || "Не отправилось");
      return;
    }
    setMsg(`Письмо ушло с ${data.from || "вашего ящика"} на ${data.to}`);
  }

  return (
    <Card className="max-w-lg space-y-4">
      <h2 className="font-serif text-xl text-navy">Моя исходящая почта</h2>
      <p className="text-sm text-muted">
        Рассылка документов, заявления и запросы средств уходят с вашего ящика, не с почты студии. Нужен пароль
        приложения Mail.ru / Яндекса / Google, не обычный пароль входа.
      </p>
      {connected ? (
        <p className="rounded-xl bg-[var(--ok-bg)] px-3 py-2 text-sm text-ok">Почта подключена</p>
      ) : (
        <p className="rounded-xl bg-[var(--warn-bg)] px-3 py-2 text-sm text-warn">
          Пока не подключена — письма пойдут с ящика студии, если он задан в настройках.
        </p>
      )}
      <form className="space-y-4" onSubmit={save}>
        <Field label="Рабочий email">
          <Input name="email" type="email" defaultValue={email} placeholder="ivanov@vidial-media.ru" required />
        </Field>
        <Field label="Пароль приложения" hint={connected ? "оставьте пустым, чтобы не менять" : "из настроек безопасности почты"}>
          <Input
            name="smtpPassword"
            type="password"
            placeholder={connected ? "••••••" : ""}
            autoComplete="new-password"
          />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy}>
            Сохранить
          </Button>
          <Button type="button" variant="secondary" disabled={busy || !connected} onClick={test}>
            Проверить: письмо себе
          </Button>
        </div>
        {msg ? <p className="text-sm text-navy">{msg}</p> : null}
      </form>
    </Card>
  );
}
