"use client";

import { useState } from "react";
import { Button, ErrorText, Field, Input } from "@/components/ui";

type Passport = {
  series: string;
  number: string;
  issuedBy: string;
  issuedAt: string;
  city: string;
  street: string;
  house: string;
  flat: string;
};

export function NdaForm({
  userId,
  birthDate,
  sign,
  passport,
  fileId,
}: {
  userId: string;
  birthDate: string;
  sign: string;
  passport: Passport;
  fileId: string;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [savedId, setSavedId] = useState(fileId);
  const [saved, setSaved] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSaved(false);
    const fd = new FormData(e.currentTarget);
    const body = Object.fromEntries(fd.entries());
    const res = await fetch(`/api/users/${userId}/nda`, {
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
    setSaved(true);
  }

  return (
    <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
      <ErrorText>{error}</ErrorText>
      <Field label="Дата рождения">
        <Input name="birthDate" type="date" defaultValue={birthDate} required />
      </Field>
      <p className="text-sm text-muted md:self-end">Подпись в файле: {sign}</p>
      <Field label="Серия паспорта">
        <Input name="series" defaultValue={passport.series} inputMode="numeric" autoComplete="off" required placeholder="5204" />
      </Field>
      <Field label="Номер паспорта">
        <Input name="number" defaultValue={passport.number} inputMode="numeric" autoComplete="off" required placeholder="123456" />
      </Field>
      <div className="md:col-span-2">
        <Field label="Кем выдан">
          <Input name="issuedBy" defaultValue={passport.issuedBy} required placeholder="Отделом УФМС России по Омской области" />
        </Field>
      </div>
      <Field label="Дата выдачи">
        <Input name="issuedAt" type="date" defaultValue={passport.issuedAt} required />
      </Field>
      <Field label="Город регистрации">
        <Input name="city" defaultValue={passport.city} required placeholder="Омск" />
      </Field>
      <Field label="Улица">
        <Input name="street" defaultValue={passport.street} required placeholder="Лермонтова" />
      </Field>
      <Field label="Дом">
        <Input name="house" defaultValue={passport.house} required placeholder="4" />
      </Field>
      <Field label="Квартира" hint="Если квартиры нет, оставьте пустым">
        <Input name="flat" defaultValue={passport.flat} placeholder="6" />
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
        <Button href={`/employees/${userId}`} variant="ghost">
          К карточке
        </Button>
      </div>
      {saved ? <p className="text-sm text-muted md:col-span-2">Соглашение собрано. Скачайте файл и отдайте на подпись.</p> : null}
    </form>
  );
}
