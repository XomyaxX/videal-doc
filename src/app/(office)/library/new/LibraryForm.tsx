"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ErrorText, Field, Input, Select, Textarea } from "@/components/ui";
import { guessLibraryKind, libraryKindOk, LIBRARY_KINDS, titleFromFilename } from "@/lib/library-kinds";
import { uploadLibraryFile } from "@/lib/library-upload";

type Row = { key: string; file: File };

export function LibraryForm({ parentId = "" }: { parentId?: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("file");
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
    setKind((k) => (k && k !== "file" ? k : guessLibraryKind(incoming[0].name)));
    setError("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (rows.length === 0) {
      setError("Перетащите файлы или выберите их с диска");
      return;
    }
    setBusy(true);
    setError("");
    try {
      let lastId = "";
      for (const row of rows) {
        const fileName = row.file.name;
        const data = await uploadLibraryFile({
          file: row.file,
          fileName,
          parentId: parentId || undefined,
          title: rows.length === 1 ? title.trim() || titleFromFilename(fileName) : titleFromFilename(fileName),
          kind: libraryKindOk(kind) ? kind : guessLibraryKind(fileName),
          description: description.trim() || title.trim() || titleFromFilename(fileName),
        });
        lastId = data.id || lastId;
      }
      router.push(parentId ? `/library?folder=${parentId}` : lastId ? `/library/${lastId}` : "/library");
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : "Не удалось сохранить");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <ErrorText>{error}</ErrorText>
      <Field label="Название" hint="Если файлов несколько, у каждого будет своя карточка">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          placeholder="Концепты комнаты, логотипы Superглазка…"
        />
      </Field>
      <Field label="Тип" hint={spec?.hint || "Ярлык карточки. Тип файла не ограничивает — можно mp3, архив, что угодно."}>
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
        <p className="mt-2 max-w-md text-muted">Любые файлы: mp3, pdf, архивы, видео. Можно добавить ещё после первого броска.</p>
        <input
          type="file"
          multiple
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
