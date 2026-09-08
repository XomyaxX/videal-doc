"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, ErrorText, Field, Input } from "@/components/ui";
import { CameraAttach } from "@/components/CameraAttach";

export function ManualExpense({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = e.currentTarget;
    if (files.length === 0) {
      setError("Прикрепите хотя бы один документ");
      setBusy(false);
      return;
    }
    const fd = new FormData(form);
    fd.delete("file");
    fd.delete("files");
    for (const file of files) fd.append("file", file);
    const res = await fetch(`/api/advances/${reportId}/receipts`, { method: "POST", body: fd });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Не удалось добавить");
      return;
    }
    form.reset();
    setFiles([]);
    router.refresh();
  }

  return (
    <Card>
      <h2 className="font-serif text-xl text-navy">Расход без QR</h2>
      <p className="mt-1 text-sm text-muted">
        Билет, накладная, товарный чек без кода — сумма руками. Можно сразу несколько страниц или файлов.
      </p>
      <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2">
        <ErrorText>{error}</ErrorText>
        <div className="sm:col-span-2" />
        <Field label="Что купили / документ">
          <Input name="merchant" required placeholder="Авиабилет, канцтовары…" />
        </Field>
        <Field label="Сумма, ₽">
          <Input name="amount" required inputMode="decimal" placeholder="0.00" />
        </Field>
        <Field label="Дата">
          <Input name="occurredAt" type="datetime-local" />
        </Field>
        <Field label="Номер документа">
          <Input name="fd" placeholder="необязательно" />
        </Field>
        <div className="sm:col-span-2 space-y-2">
          <Field label="Документы" hint="Фото, PDF, Word с диска — или сразу снимок с камеры.">
            <Input
              type="file"
              multiple
              accept="image/*,.pdf,application/pdf,.jpg,.jpeg,.png,.webp,.docx,.doc,.xlsx,.xls"
              onChange={(e) => {
                const next = Array.from(e.target.files || []);
                setFiles((prev) => {
                  const names = new Set(prev.map((f) => `${f.name}:${f.size}`));
                  return [...prev, ...next.filter((f) => !names.has(`${f.name}:${f.size}`))];
                });
                e.target.value = "";
              }}
            />
          </Field>
          <CameraAttach
            onCapture={(file) =>
              setFiles((prev) => {
                const key = `${file.name}:${file.size}`;
                if (prev.some((f) => `${f.name}:${f.size}` === key)) return prev;
                return [...prev, file];
              })
            }
          />
        </div>
        <Field label="Заметка">
          <Input name="note" />
        </Field>
        {files.length > 0 ? (
          <ul className="sm:col-span-2 divide-y divide-line rounded-xl border border-line bg-paper">
            {files.map((f, i) => (
              <li key={`${f.name}-${f.size}-${i}`} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 truncate">
                  {i + 1}. {f.name}
                </span>
                <button
                  type="button"
                  className="shrink-0 text-xs font-semibold text-muted hover:text-bad"
                  onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                >
                  убрать
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="sm:col-span-2">
          <Button type="submit" disabled={busy || files.length === 0}>
            {busy ? "Сохраняем…" : files.length > 1 ? `Добавить расход · ${files.length} файла` : "Добавить расход"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
