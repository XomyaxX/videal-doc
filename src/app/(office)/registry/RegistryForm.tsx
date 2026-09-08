"use client";

import { useState } from "react";
import { Button, Card, ErrorText, Field, Input, Select, Textarea } from "@/components/ui";
import { officeYmd } from "@/lib/dates";

export function RegistryForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/registry", { method: "POST", body: new FormData(e.currentTarget) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Не удалось записать");
      return;
    }
    window.location.href = `/registry/${data.id}`;
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <ErrorText>{error}</ErrorText>
      <Card className="grid gap-4 md:grid-cols-2">
        <Field label="Направление">
          <Select name="direction" defaultValue="in">
            <option value="in">Входящее (нам пришло)</option>
            <option value="out">Исходящее (мы отправили)</option>
          </Select>
        </Field>
        <Field label="Дата письма">
          <Input name="datedAt" type="date" defaultValue={officeYmd()} required />
        </Field>
        <Field label="От кого / кому" hint="Организация или человек. Не путать с внутренней рассылкой сотрудникам.">
          <Input name="correspondent" required placeholder="ООО «Пример» / Иванов И.И." />
        </Field>
        <Field label="Тема">
          <Input name="subject" required placeholder="Договор, запрос, письмо" />
        </Field>
        <div className="md:col-span-2">
          <Field label="Комментарий">
            <Textarea name="comment" placeholder="Куда положили бумагу, кто вёл" />
          </Field>
        </div>
        <Field label="Файл" hint="Не обязательно. Скан или PDF.">
          <Input name="file" type="file" />
        </Field>
      </Card>
      <Button type="submit" disabled={busy}>
        {busy ? "…" : "Записать в журнал"}
      </Button>
    </form>
  );
}
