"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, ErrorText, Field, Input, Select, Textarea } from "@/components/ui";
import { HR_BASIS, HR_TYPES, hrType } from "@/lib/hrdocs";

export function StatementForm({
  managers,
  defaultManagerId,
}: {
  managers: { id: string; name: string }[];
  defaultManagerId: string;
}) {
  const router = useRouter();
  const [type, setType] = useState("time_off");
  const spec = useMemo(() => hrType(type)!, [type]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    const payload: Record<string, string> = {};
    for (const key of spec.fields) payload[key] = String(fd.get(key) || "").trim();
    const res = await fetch("/api/hrdocs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type,
        managerId: String(fd.get("managerId") || ""),
        payload,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) setError(data.error || "Ошибка");
    else router.push(`/statements/${data.id}`);
  }

  const f = spec.fields;
  return (
    <form className="space-y-4" onSubmit={submit}>
      <ErrorText>{error}</ErrorText>
      <Card>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Тип">
            <Select name="type" value={type} onChange={(e) => setType(e.target.value)}>
              {HR_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Кому" hint="Конкретный руководитель">
            <Select name="managerId" defaultValue={defaultManagerId} required>
              <option value="">выберите</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
          {f.includes("date") ? (
            <Field label="Дата">
              <Input name="date" type="date" required />
            </Field>
          ) : null}
          {f.includes("dateTo") ? (
            <Field label="По">
              <Input name="dateTo" type="date" />
            </Field>
          ) : null}
          {f.includes("from") ? (
            <Field label="С">
              <Input name="from" type="date" required />
            </Field>
          ) : null}
          {f.includes("to") ? (
            <Field label="По">
              <Input name="to" type="date" required />
            </Field>
          ) : null}
          {f.includes("basis") ? (
            <Field label="Основание">
              <Select name="basis" defaultValue="overtime">
                {HR_BASIS.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          {f.includes("subject") ? (
            <div className="md:col-span-2">
              <Field label="Тема">
                <Input name="subject" required />
              </Field>
            </div>
          ) : null}
          {f.includes("reason") ? (
            <div className="md:col-span-2">
              <Field label="Причина / комментарий">
                <Textarea name="reason" />
              </Field>
            </div>
          ) : null}
          {f.includes("body") ? (
            <div className="md:col-span-2">
              <Field label="Текст">
                <Textarea name="body" required className="min-h-[140px]" />
              </Field>
            </div>
          ) : null}
        </div>
      </Card>
      <Button disabled={busy} type="submit">
        Сохранить и открыть для печати
      </Button>
    </form>
  );
}
