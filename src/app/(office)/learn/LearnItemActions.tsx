"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button, ErrorText, Field, Input, Textarea } from "@/components/ui";
import { ProgressBar } from "@/components/ProgressBar";
import { uploadTrainingFile } from "@/lib/training-upload";
import type { TrainingCard } from "@/lib/training-types";

export function LearnItemActions({ item }: { item: TrainingCard }) {
  const router = useRouter();
  const filePick = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [pct, setPct] = useState(0);
  const [uploadName, setUploadName] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy("save");
    setError("");
    const res = await fetch(`/api/learn/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy("");
    if (!res.ok) {
      setError(data.error || "Не удалось сохранить");
      return;
    }
    router.refresh();
  }

  async function trashItem() {
    if (!confirm(`Убрать «${item.title}» в корзину? Стереть навсегда сможет только администратор.`)) return;
    setBusy("trash");
    setError("");
    const res = await fetch(`/api/learn/${item.id}`, { method: "DELETE" });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy("");
    if (!res.ok) {
      setError(data.error || "Не удалось убрать");
      return;
    }
    router.push("/learn/trash");
  }

  async function trashFile(fileId: string, name: string) {
    if (!confirm(`Убрать файл «${name}» в корзину?`)) return;
    setBusy(fileId);
    setError("");
    const res = await fetch(`/api/learn/${item.id}/file/${fileId}`, { method: "DELETE" });
    const data = (await res.json().catch(() => ({}))) as { error?: string; itemTrashed?: boolean };
    setBusy("");
    if (!res.ok) {
      setError(data.error || "Не удалось убрать");
      return;
    }
    if (data.itemTrashed) router.push("/learn/trash");
    else router.refresh();
  }

  async function addFiles(list: FileList | null) {
    if (!list?.length) return;
    setError("");
    for (const file of Array.from(list)) {
      setUploadName(file.name);
      setPct(0);
      setBusy("upload");
      try {
        await uploadTrainingFile({
          file,
          itemId: item.id,
          onProgress: setPct,
        });
      } catch (e) {
        setBusy("");
        setError(e instanceof Error ? e.message : "Не удалось загрузить");
        return;
      }
    }
    setBusy("");
    setUploadName("");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <ErrorText>{error}</ErrorText>
      <form onSubmit={(e) => void save(e)} className="space-y-3">
        <Field label="Название">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </Field>
        <Field label="Описание" hint="Кратко, о чём материал">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={Boolean(busy)}>
            {busy === "save" ? "Сохраняем…" : "Сохранить"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => filePick.current?.click()} disabled={Boolean(busy)}>
            Добавить файл
          </Button>
          <Button type="button" variant="danger" onClick={() => void trashItem()} disabled={Boolean(busy)}>
            {busy === "trash" ? "Убираем…" : "В корзину"}
          </Button>
        </div>
      </form>
      <input
        ref={filePick}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          void addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      {busy === "upload" ? <ProgressBar value={pct} label={uploadName} /> : null}
      {item.files.length > 0 ? (
        <ul className="space-y-2 text-sm">
          {item.files.map((f) => (
            <li key={f.id} className="flex items-baseline justify-between gap-3">
              <a className="min-w-0 break-all font-semibold text-navy underline" href={`${f.fileUrl}?dl=1`}>
                {f.originalName}
                {f.sizeLabel ? ` · ${f.sizeLabel}` : ""}
              </a>
              <button
                type="button"
                disabled={Boolean(busy)}
                className="shrink-0 text-sm font-semibold text-bad hover:underline disabled:opacity-50"
                onClick={() => void trashFile(f.id, f.originalName)}
              >
                в корзину
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
