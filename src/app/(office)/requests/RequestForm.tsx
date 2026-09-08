"use client";

import { useState } from "react";
import { Button, Card, ErrorText, Field, Input, Select, Textarea } from "@/components/ui";
import { REQUEST_CATEGORIES, REQUEST_UNITS } from "@/lib/requests";

type Item = { name: string; qty: string; unit: string; url: string; note: string; fileId: string; fileName: string };

const empty = (): Item => ({ name: "", qty: "1", unit: "шт", url: "", note: "", fileId: "", fileName: "" });

export function RequestForm() {
  const [items, setItems] = useState<Item[]>([empty()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function patch(i: number, part: Partial<Item>) {
    setItems((list) => list.map((row, idx) => (idx === i ? { ...row, ...part } : row)));
  }

  async function upload(i: number, file: File) {
    const fd = new FormData();
    fd.set("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Не удалось загрузить скрин");
      return;
    }
    patch(i, { fileId: data.id, fileName: data.name });
  }

  async function send(form: HTMLFormElement, submit: boolean) {
    setBusy(true);
    setError("");
    const fd = new FormData(form);
    const payload = {
      title: String(fd.get("title") || ""),
      category: String(fd.get("category") || ""),
      reason: String(fd.get("reason") || ""),
      submit,
      items: items.map((it) => ({
        name: it.name,
        qty: Number(it.qty) || 1,
        unit: it.unit,
        url: it.url,
        note: it.note,
        fileId: it.fileId,
      })),
    };
    const res = await fetch("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Ошибка");
      return;
    }
    window.location.href = `/requests/${data.id}`;
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
        <h2 className="font-serif text-xl text-navy">Что нужно купить</h2>
        <p className="mt-1 text-sm text-muted">Сумму и срок ставит АХО. Вам — название, штуки, ссылка и скрин.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="Кратко">
            <Input name="title" required placeholder="Adobe, клавиатура, ChatGPT…" />
          </Field>
          <Field label="Категория">
            <Select name="category" defaultValue="software">
              {REQUEST_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="md:col-span-2">
            <Field label="Зачем">
              <Textarea name="reason" placeholder="Для какого проекта или задачи" />
            </Field>
          </div>
        </div>
      </Card>
      {items.map((it, i) => (
        <Card key={i}>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold text-navy">Позиция {i + 1}</h3>
            {items.length > 1 ? (
              <button
                type="button"
                className="text-sm text-muted hover:text-bad"
                onClick={() => setItems((list) => list.filter((_, idx) => idx !== i))}
              >
                убрать
              </button>
            ) : null}
          </div>
          <div className="grid gap-3 md:grid-cols-6">
            <div className="md:col-span-3">
              <Field label="Название">
                <Input value={it.name} onChange={(e) => patch(i, { name: e.target.value })} required placeholder="Название товара или тарифа" />
              </Field>
            </div>
            <Field label="Штук">
              <Input type="number" min={1} value={it.qty} onChange={(e) => patch(i, { qty: e.target.value })} />
            </Field>
            <Field label="Ед.">
              <Select value={it.unit} onChange={(e) => patch(i, { unit: e.target.value })}>
                {REQUEST_UNITS.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </Select>
            </Field>
            <div className="md:col-span-6">
              <Field label="Ссылка">
                <Input value={it.url} onChange={(e) => patch(i, { url: e.target.value })} placeholder="https://" />
              </Field>
            </div>
            <div className="md:col-span-3">
              <Field label="Скриншот" hint={it.fileName || "jpg, png, pdf"}>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,.pdf"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void upload(i, f);
                  }}
                />
              </Field>
            </div>
            <div className="md:col-span-3">
              <Field label="Заметка">
                <Input value={it.note} onChange={(e) => patch(i, { note: e.target.value })} />
              </Field>
            </div>
          </div>
        </Card>
      ))}
      <Button type="button" variant="secondary" onClick={() => setItems((list) => [...list, empty()])}>
        Ещё позицию
      </Button>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          Отправить в АХО
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
          Черновик
        </Button>
      </div>
    </form>
  );
}
