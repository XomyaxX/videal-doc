"use client";

import { useState } from "react";
import { Button, Card, ErrorText, Field, Input, Select, Textarea } from "@/components/ui";

type Person = {
  id: string;
  lastName: string;
  firstName: string;
  middleName: string;
  departmentId: string | null;
};

export function SendForm({
  people,
  departments,
}: {
  people: Person[];
  departments: { id: string; name: string }[];
}) {
  const [mode, setMode] = useState<"all" | "dept" | "list">("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [action, setAction] = useState<"ack" | "sign" | "approve">("ack");
  const [approvers, setApprovers] = useState<string[]>([]);
  const [dueAt, setDueAt] = useState("");

  const recipientCount =
    mode === "all" ? people.length : mode === "dept" ? "отдел" : selected.length;
  const actionLabel =
    action === "ack" ? "ознакомиться" : action === "sign" ? "вернуть скан подписи" : "согласовать руководителем";

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setBusy(false);
      setError("Приложите файл документа");
      return;
    }
    if (mode === "all") form.set("all", "true");
    if (mode === "list") selected.forEach((id) => form.append("recipientIds", id));
    form.delete("requireAck");
    form.delete("requireSignedReturn");
    form.delete("requireApproval");
    if (action === "ack") form.set("requireAck", "true");
    if (action === "sign") form.set("requireSignedReturn", "true");
    if (action === "approve") {
      form.set("requireApproval", "true");
      if (approvers.length === 0) {
        setBusy(false);
        setError("Выберите, кто согласовывает");
        return;
      }
      approvers.forEach((id) => form.append("approverIds", id));
    }
    const who =
      mode === "all" ? `всем (${people.length})` : mode === "list" ? `${selected.length} чел.` : "отделу";
    if (
      !confirm(
        `Разослать: ${who}. Действие: ${actionLabel}.${dueAt ? ` Срок: ${dueAt.replace("T", " ")}.` : ""}`,
      )
    ) {
      setBusy(false);
      return;
    }
    const res = await fetch("/api/documents", { method: "POST", body: form });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Не удалось отправить");
      return;
    }
    window.location.href = `/documents/${data.id}`;
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <ErrorText>{error}</ErrorText>
      <Card>
        <h2 className="font-serif text-xl text-navy">1. Документ</h2>
        <div className="mt-4 grid gap-4">
          <Field label="Название">
            <Input name="title" required placeholder="Приказ об охране труда" />
          </Field>
          <Field label="Комментарий для сотрудников">
            <Textarea name="comment" placeholder="Прочитайте и поставьте галочку до пятницы" />
          </Field>
          <Field label="Файл" hint="PDF, Word, Excel или картинка">
            <Input name="file" type="file" required />
          </Field>
        </div>
      </Card>

      <Card>
        <h2 className="font-serif text-xl text-navy">2. Кому</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {(
            [
              ["all", "Всем сотрудникам"],
              ["dept", "Отделу"],
              ["list", "Выбрать людей"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              className={`rounded-xl px-4 py-2 text-sm font-semibold ${mode === id ? "bg-navy !text-white" : "bg-white border border-line text-navy"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {mode === "dept" ? (
          <Field label="Отдел" hint=" ">
            <Select name="departmentId" required className="mt-3">
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        {mode === "list" ? (
          <div className="mt-3 max-h-64 overflow-auto rounded-xl border border-line bg-white p-2">
            {people.map((p) => {
              const name = `${p.lastName} ${p.firstName} ${p.middleName}`.trim();
              const on = selected.includes(p.id);
              return (
                <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-paper">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() =>
                      setSelected((prev) => (on ? prev.filter((x) => x !== p.id) : [...prev, p.id]))
                    }
                  />
                  {name}
                </label>
              );
            })}
          </div>
        ) : null}
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" name="includeMe" /> Я тоже в списке
        </label>
      </Card>

      <Card>
        <h2 className="font-serif text-xl text-navy">3. Что сделать</h2>
        <div className="mt-4 space-y-2">
          {(
            [
              ["ack", "Ознакомиться"],
              ["sign", "Вернуть скан подписи"],
              ["approve", "Согласовать руководителем"],
            ] as const
          ).map(([id, label]) => (
            <label key={id} className="flex items-center gap-2">
              <input type="radio" name="actionKind" checked={action === id} onChange={() => setAction(id)} />
              {label}
            </label>
          ))}
          {action === "approve" ? (
            <div className="rounded-xl border border-line bg-white p-3">
              <p className="mb-2 text-sm font-semibold text-navy">Кто согласовывает</p>
              <div className="max-h-48 overflow-auto">
                {people.map((p) => {
                  const name = `${p.lastName} ${p.firstName} ${p.middleName}`.trim();
                  const on = approvers.includes(p.id);
                  return (
                    <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-paper">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() =>
                          setApprovers((prev) => (on ? prev.filter((x) => x !== p.id) : [...prev, p.id]))
                        }
                      />
                      {name}
                    </label>
                  );
                })}
              </div>
            </div>
          ) : null}
          <label className="flex items-center gap-2">
            <input type="checkbox" name="remindDaily" /> Напоминать каждый день, пока не сделают
          </label>
          <Field label="Срок">
            <Input name="dueAt" type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </Field>
        </div>
      </Card>

      <p className="text-sm text-muted">
        Кому: {typeof recipientCount === "number" ? `${recipientCount} чел.` : recipientCount}. Действие: {actionLabel}
        {dueAt ? `. Срок: ${dueAt.replace("T", " ")}` : ""}.
      </p>
      <Button type="submit" disabled={busy} className="h-12 px-8 text-base">
        {busy ? "Отправляем…" : "Разослать"}
      </Button>
    </form>
  );
}
