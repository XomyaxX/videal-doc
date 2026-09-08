"use client";

import { useState } from "react";
import { Button, Card, ErrorText, Field, Input, Select, Textarea } from "@/components/ui";
import { SearchSelect, type SearchOption } from "@/components/SearchSelect";
import { officeYmd } from "@/lib/dates";

export function FundForm({
  managers,
  defaultManagerId,
  payees,
  defaultPayeeId,
}: {
  managers: { id: string; name: string }[];
  defaultManagerId: string;
  payees: SearchOption[];
  defaultPayeeId: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const today = officeYmd();

  async function send(form: HTMLFormElement, submit: boolean) {
    setBusy(true);
    setError("");
    const fd = new FormData(form);
    if (!String(fd.get("payee") || "").trim()) {
      setBusy(false);
      setError("Выберите получателя из списка");
      return;
    }
    if (submit) fd.set("submit", "true");
    const res = await fetch("/api/funds", { method: "POST", body: fd });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Не удалось сохранить");
      return;
    }
    window.location.href = `/funds/${data.id}`;
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        send(e.currentTarget, true);
      }}
    >
      <ErrorText>{error}</ErrorText>
      <Card>
        <h2 className="font-serif text-xl text-navy">Служебная записка</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="На что нужны деньги">
            <Input name="purpose" required placeholder="Закупка расходников, командировка, гонорар…" />
          </Field>
          <Field label="Сумма, ₽">
            <Input name="amount" required placeholder="0,00" inputMode="decimal" />
          </Field>
          <Field label="Кому перечислить / получатель" hint="По умолчанию — ваш профиль, можно найти другого сотрудника">
            <SearchSelect name="payee" options={payees} defaultId={defaultPayeeId} required />
          </Field>
          <Field label="Нужны к дате" hint="Не раньше сегодня. Появится в календаре">
            <Input name="neededAt" type="date" min={today} />
          </Field>
          <div className="md:col-span-2">
            <Field label="Обоснование">
              <Textarea name="details" placeholder="Почему нужны средства, что будет оплачено, сроки" />
            </Field>
          </div>
          <Field
            label="Руководитель для согласования"
            hint={managers.length === 0 ? "В карточках сотрудников нет должности или роли «Руководитель»" : "Только сотрудники с должностью или ролью «Руководитель»"}
          >
            <Select name="managerId" defaultValue={defaultManagerId} required={managers.length > 0}>
              <option value="">{managers.length === 0 ? "Нет руководителей в справочнике" : "Выберите"}</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Вложения" hint="Счёт, договор, расчёт — PDF, Word, Excel, фото">
            <Input name="files" type="file" multiple />
          </Field>
        </div>
      </Card>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? "Отправляем…" : "Отправить руководителю"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={(e) => {
            const form = (e.currentTarget as HTMLButtonElement).form;
            if (form) send(form, false);
          }}
        >
          Сохранить черновик
        </Button>
      </div>
    </form>
  );
}
