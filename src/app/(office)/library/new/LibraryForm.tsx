"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ErrorText, Field, Input, Select, Textarea } from "@/components/ui";
import { LIBRARY_ACCEPT, LIBRARY_KIND_EXT, LIBRARY_KINDS, titleFromFilename } from "@/lib/library-kinds";

type Row = { key: string; file: File };

function extOf(name: string) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

export function LibraryForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("image");
  const [description, setDescription] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const spec = useMemo(() => LIBRARY_KINDS.find((k) => k.id === kind), [kind]);

  function addFiles(list: FileList | File[]) {
    const incoming = Array.from(list).filter((f) => f.size > 0);
    if (incoming.length === 0) return;
    setRows((prev) => {
      const next = [...prev];
      for (const file of incoming) {
        const dup = next.some((r) => r.file.name === file.name && r.file.size === file.size);
        if (dup) continue;
        next.push({
          key: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`,
          file,
        });
      }
      return next;
    });
    setTitle((t) => t || titleFromFilename(incoming[0].name));
    setError("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (rows.length === 0) {
      setError("Перетащите файлы или выберите их с диска");
      return;
    }
    const allowed = LIBRARY_KIND_EXT[kind] || [];
    const bad = rows.find((r) => !allowed.includes(extOf(r.file.name)));
    if (bad) {
      setError(`«${bad.file.name}» не подходит для «${spec?.label}». Уберите файл или смените тип блока.`);
      return;
    }
    setBusy(true);
    setError("");
    const fd = new FormData();
    fd.set("title", title.trim() || titleFromFilename(rows[0].file.name));
    fd.set("kind", kind);
    fd.set("description", description.trim());
    for (const row of rows) fd.append("files", row.file, row.file.name);
    const res = await fetch("/api/library", { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Не удалось сохранить");
      return;
    }
    router.push(data.id ? `/library/${data.id}` : "/library");
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <ErrorText>{error}</ErrorText>
      <Field label="Название блока" hint="Одна карточка в хранилище, сколько бы файлов ни положили">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          placeholder="Концепты комнаты, логотипы Superглазка…"
        />
      </Field>
      <Field label="Тип" hint={spec?.hint}>
        <Select name="kind" value={kind} onChange={(e) => setKind(e.target.value)} required>
          {LIBRARY_KINDS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Описание">
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          placeholder="Финальные концепты для анимации сцены SC03, не резать поля."
        />
      </Field>

      <label
        className={`dropzone flex min-h-[180px] cursor-pointer flex-col items-center justify-center px-6 text-center ${
          over ? "active" : ""
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          addFiles(e.dataTransfer.files);
        }}
      >
        <div className="font-serif text-2xl text-navy">Перетащите файлы сюда</div>
        <p className="mt-2 max-w-md text-muted">Все попадут в один блок. Можно добавить ещё после первого броска.</p>
        <input
          type="file"
          multiple
          accept={LIBRARY_ACCEPT}
          className="mt-4"
          disabled={busy}
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </label>

      {rows.length > 0 ? (
        <ul className="space-y-1 rounded-xl border border-line bg-white px-3 py-2 text-sm">
          {rows.map((row) => (
            <li key={row.key} className="flex items-center justify-between gap-2 py-1">
              <span className="truncate">{row.file.name}</span>
              <Button
                type="button"
                variant="ghost"
                className="px-2 py-1 text-sm"
                disabled={busy}
                onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
              >
                Убрать
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      <Button type="submit" disabled={busy || rows.length === 0}>
        {busy ? "Сохраняем…" : "Положить блок в хранилище"}
      </Button>
    </form>
  );
}
