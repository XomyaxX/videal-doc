"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ErrorText, Field, Input, Select } from "@/components/ui";

export function GuestNdaForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [savedId, setSavedId] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    const body = Object.fromEntries(fd.entries());
    const res = await fetch("/api/nda/guest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok || !data.fileId) {
      setError(data.error || "Не удалось собрать соглашение");
      return;
    }
    setSavedId(data.fileId);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
      <ErrorText>{error}</ErrorText>
      <Field label="Фамилия">
        <Input name="lastName" required autoComplete="off" />
      </Field>
      <Field label="Имя">
        <Input name="firstName" required autoComplete="off" />
      </Field>
      <Field label="Отчество">
        <Input name="middleName" autoComplete="off" />
      </Field>
      <Field label="Пол" hint="Если пусто — по отчеству">
        <Select name="gender" defaultValue="">
          <option value="">не указан</option>
          <option value="m">мужской</option>
          <option value="f">женский</option>
        </Select>
      </Field>
      <Field label="Дата рождения">
        <Input name="birthDate" type="date" required />
      </Field>
      <Field label="Серия паспорта">
        <Input name="series" inputMode="numeric" autoComplete="off" required placeholder="5204" />
      </Field>
      <Field label="Номер паспорта">
        <Input name="number" inputMode="numeric" autoComplete="off" required placeholder="123456" />
      </Field>
      <div className="md:col-span-2">
        <Field label="Кем выдан">
          <Input name="issuedBy" required placeholder="Отделом УФМС России по Омской области" />
        </Field>
      </div>
      <Field label="Дата выдачи">
        <Input name="issuedAt" type="date" required />
      </Field>
      <Field label="Город регистрации">
        <Input name="city" required placeholder="Омск" />
      </Field>
      <Field label="Улица">
        <Input name="street" required placeholder="Лермонтова" />
      </Field>
      <Field label="Дом">
        <Input name="house" required placeholder="4" />
      </Field>
      <Field label="Квартира" hint="Если квартиры нет, оставьте пустым">
        <Input name="flat" placeholder="6" />
      </Field>
      <div className="flex flex-wrap items-center gap-2 md:col-span-2">
        <Button type="submit" disabled={busy}>
          {busy ? "Собираем…" : "Собрать соглашение"}
        </Button>
        {savedId ? (
          <Button href={`/api/files/${savedId}`} variant="secondary">
            Скачать
          </Button>
        ) : null}
        <Button href="/employees" variant="ghost">
          К сотрудникам
        </Button>
      </div>
      {savedId ? (
        <p className="text-sm text-muted md:col-span-2">Соглашение собрано. Скачайте файл и отдайте гостю на подпись. В список сотрудников гость не попадает.</p>
      ) : null}
    </form>
  );
}
