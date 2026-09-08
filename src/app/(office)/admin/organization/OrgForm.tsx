"use client";

import { useState } from "react";
import { Button, ErrorText, Field, Input } from "@/components/ui";

export function OrgForm({ org }: { org: Record<string, unknown> }) {
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const fields: [string, string][] = [
    ["name", "Полное наименование"],
    ["shortName", "Краткое"],
    ["inn", "ИНН"],
    ["kpp", "КПП"],
    ["ogrn", "ОГРН"],
    ["okpo", "ОКПО"],
    ["legalAddress", "Юридический адрес"],
    ["actualAddress", "Фактический адрес"],
    ["postalAddress", "Почтовый адрес"],
    ["phone", "Телефон"],
    ["email", "Email"],
    ["directorTitle", "Должность руководителя"],
    ["directorName", "ФИО руководителя"],
    ["accountantName", "ФИО главбуха"],
    ["bankName", "Банк"],
    ["bankBik", "БИК"],
    ["bankAccount", "Расчётный счёт"],
    ["corrAccount", "Корр. счёт"],
    ["debitAccount", "Дебет счёта в АО-1 (колонка 9)"],
  ];
  return (
    <form
      className="grid gap-4 md:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        const body = Object.fromEntries(new FormData(e.currentTarget).entries());
        const res = await fetch("/api/admin/organization", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) setError("Не удалось сохранить");
        else setMsg("Сохранено");
      }}
    >
      <ErrorText>{error}</ErrorText>
      {fields.map(([name, label]) => (
        <Field key={name} label={label}>
          <Input name={name} defaultValue={String(org[name] ?? "")} />
        </Field>
      ))}
      <div className="md:col-span-2 flex items-center gap-3">
        <Button type="submit">Сохранить реквизиты</Button>
        {msg ? <span className="text-ok">{msg}</span> : null}
      </div>
    </form>
  );
}
