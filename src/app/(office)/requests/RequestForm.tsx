"use client";

import { useState } from "react";
import { Button, Card, ErrorText, Field, Input, Select, Textarea } from "@/components/ui";
import { FileDrop, type DroppedFile } from "@/components/FileDrop";
import { REQUEST_CATEGORIES, REQUEST_UNITS } from "@/lib/requests";

type Item = {
  name: string;
  qty: string;
  unit: string;
  url: string;
  note: string;
  files: DroppedFile[];
};

const empty = (): Item => ({ name: "", qty: "1", unit: "шт", url: "", note: "", files: [] });
const MAX_FILES = 20;

export function RequestForm() {
  const [items, setItems] = useState<Item[]>([empty()]);
  const [docs, setDocs] = useState<DroppedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function patch(i: number, part: Partial<Item>) {
    setItems((list) => list.map((row, idx) => (idx === i ? { ...row, ...part } : row)));
  }

  async function uploadMany(list: File[]): Promise<DroppedFile[]> {
    const out: DroppedFile[] = [];
    for (const file of list) {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Не удалось загрузить «${file.name}»`);
      out.push({ id: data.id, name: data.name || file.name, mime: data.mime });
    }
    return out;
  }

  async function addDocs(list: File[]) {
    setBusy(true);
    setError("");
    try {
      const room = MAX_FILES - docs.length;
      if (room <= 0) throw new Error(`Не больше ${MAX_FILES} файлов к запросу`);
      const added = await uploadMany(list.slice(0, room));
      setDocs((prev) => [...prev, ...added]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    }
    setBusy(false);
  }

  async function addItemFiles(i: number, list: File[]) {
    setBusy(true);
    setError("");
    try {
      const current = items[i]?.files.length || 0;
      const room = MAX_FILES - current;
      if (room <= 0) throw new Error(`Не больше ${MAX_FILES} файлов на позицию`);
      const added = await uploadMany(list.slice(0, room));
      setItems((rows) =>
        rows.map((row, idx) => (idx === i ? { ...row, files: [...row.files, ...added] } : row)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    }
    setBusy(false);
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
      fileIds: docs.map((f) => f.id),
      items: items.map((it) => ({
        name: it.name,
        qty: Number(it.qty) || 1,
        unit: it.unit,
        url: it.url,
        note: it.note,
        fileId: it.files[0]?.id || "",
        fileIds: it.files.map((f) => f.id),
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
        <p className="mt-1 text-sm text-muted">Сумму и срок ставит АХО. Вам — название, штуки, ссылка и файлы.</p>
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
          <div className="md:col-span-2">
            <Field label="Фото и документы к запросу" hint="Скрин магазина, счёт, ТЗ — можно пачку сразу">
              <FileDrop files={docs} onAdd={addDocs} onRemove={(id) => setDocs((list) => list.filter((f) => f.id !== id))} busy={busy} />
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
            <div className="md:col-span-6">
              <Field label="Фото и документы позиции" hint="Несколько скринов или файлов — перетащите сюда">
                <FileDrop
                  compact
                  files={it.files}
                  onAdd={(list) => void addItemFiles(i, list)}
                  onRemove={(id) =>
                    patch(i, { files: it.files.filter((f) => f.id !== id) })
                  }
                  busy={busy}
                />
              </Field>
            </div>
            <div className="md:col-span-6">
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
