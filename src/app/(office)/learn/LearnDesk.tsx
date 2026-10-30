"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FolderPlus, Pencil, Trash2, Upload } from "lucide-react";
import { Button, ErrorText, Field, Input } from "@/components/ui";
import { ProgressBar } from "@/components/ProgressBar";
import { LibraryThumb, type LibraryCard } from "@/components/LibraryPreview";
import { fmtDate } from "@/lib/dates";
import { titleFromFilename } from "@/lib/library-kinds";
import { uploadTrainingFile } from "@/lib/training-upload";
import type { TrainingCard } from "@/lib/training-types";

function toCard(row: TrainingCard): LibraryCard {
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    kindLabel: row.kindLabel,
    description: row.description,
    originalName: row.originalName,
    mimeType: row.mimeType,
    uncPath: "",
    preview: row.preview,
    thumbUrl: row.thumbUrl,
    fileUrl: row.fileUrl,
    href: row.href,
    fileCount: row.fileCount,
    isFolder: row.isFolder,
    files: row.files.map((f) => ({
      id: f.id,
      originalName: f.originalName,
      mimeType: f.mimeType,
      preview: f.preview,
      fileUrl: f.fileUrl,
      thumbUrl: f.thumbUrl,
    })),
  };
}

type Job = { id: string; name: string; pct: number; error: string; status: "run" | "ok" | "fail" };

export function LearnDesk({
  items,
  folderId,
  crumbs,
}: {
  items: TrainingCard[];
  folderId: string;
  crumbs: { id: string; title: string }[];
}) {
  const router = useRouter();
  const filePick = useRef<HTMLInputElement>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState("");
  const [over, setOver] = useState(false);
  const [folderOpen, setFolderOpen] = useState(false);
  const [folderTitle, setFolderTitle] = useState("");
  const [rename, setRename] = useState<TrainingCard | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const [busy, setBusy] = useState("");
  const pumping = useRef(false);
  const queue = useRef<File[]>([]);

  async function pump() {
    if (pumping.current) return;
    pumping.current = true;
    while (queue.current.length) {
      const file = queue.current.shift()!;
      const id = `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`;
      setJobs((prev) => [...prev, { id, name: file.name, pct: 0, error: "", status: "run" }]);
      try {
        await uploadTrainingFile({
          file,
          parentId: folderId || undefined,
          title: titleFromFilename(file.name),
          onProgress: (pct) => setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, pct } : j))),
        });
        setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, pct: 100, status: "ok" } : j)));
        router.refresh();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Ошибка";
        setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, status: "fail", error: msg } : j)));
        setError(msg);
      }
    }
    pumping.current = false;
  }

  function ingest(list: FileList | File[] | null) {
    if (!list || list.length === 0) return;
    setError("");
    for (const file of Array.from(list)) queue.current.push(file);
    void pump();
  }

  async function makeFolder(e: React.FormEvent) {
    e.preventDefault();
    setBusy("folder");
    setError("");
    const res = await fetch("/api/learn/folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: folderTitle, parentId: folderId || undefined }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy("");
    if (!res.ok) {
      setError(data.error || "Не удалось создать папку");
      return;
    }
    setFolderTitle("");
    setFolderOpen(false);
    router.refresh();
  }

  async function saveRename(e: React.FormEvent) {
    e.preventDefault();
    if (!rename) return;
    setBusy(rename.id);
    setError("");
    const res = await fetch(`/api/learn/${rename.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: renameVal, description: rename.description }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy("");
    if (!res.ok) {
      setError(data.error || "Не удалось сохранить");
      return;
    }
    setRename(null);
    router.refresh();
  }

  async function trash(row: TrainingCard) {
    if (!confirm(`Убрать «${row.title}» в корзину? Файл останется, стереть навсегда сможет администратор.`)) return;
    setBusy(row.id);
    setError("");
    const res = await fetch(`/api/learn/${row.id}`, { method: "DELETE" });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy("");
    if (!res.ok) {
      setError(data.error || "Не удалось убрать");
      return;
    }
    router.refresh();
  }

  useEffect(() => {
    function onDrag(e: DragEvent) {
      if (!e.dataTransfer?.types?.includes("Files")) return;
      e.preventDefault();
    }
    window.addEventListener("dragover", onDrag);
    window.addEventListener("drop", onDrag);
    return () => {
      window.removeEventListener("dragover", onDrag);
      window.removeEventListener("drop", onDrag);
    };
  }, []);

  return (
    <div
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        if (!e.dataTransfer.files?.length) return;
        e.preventDefault();
        setOver(false);
        ingest(e.dataTransfer.files);
      }}
      className={over ? "rounded-2xl ring-2 ring-gold" : ""}
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <a href="/learn" className="rounded-lg px-2 py-1 text-sm font-semibold text-navy hover:bg-paper-2">
          Обучение
        </a>
        {crumbs.map((c) => (
          <span key={c.id} className="flex items-center gap-2">
            <span className="text-muted">/</span>
            <a href={`/learn?folder=${c.id}`} className="rounded-lg px-2 py-1 text-sm font-semibold text-navy hover:bg-paper-2">
              {c.title}
            </a>
          </span>
        ))}
        <span className="ml-auto flex flex-wrap gap-2">
          <Button href="/learn/trash" variant="secondary">
            Корзина
          </Button>
          <Button type="button" variant="secondary" onClick={() => setFolderOpen((v) => !v)}>
            <FolderPlus size={16} /> Папка
          </Button>
          <Button type="button" onClick={() => filePick.current?.click()}>
            <Upload size={16} /> Добавить
          </Button>
        </span>
      </div>

      <input
        ref={filePick}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          ingest(e.target.files);
          e.target.value = "";
        }}
      />

      {folderOpen ? (
        <form onSubmit={(e) => void makeFolder(e)} className="mb-4 flex flex-wrap items-end gap-2 rounded-2xl border border-line bg-white p-3">
          <Field label="Новая папка">
            <Input value={folderTitle} onChange={(e) => setFolderTitle(e.target.value)} placeholder="Название" required />
          </Field>
          <Button type="submit" disabled={busy === "folder"}>
            {busy === "folder" ? "…" : "Создать"}
          </Button>
        </form>
      ) : null}

      {rename ? (
        <form onSubmit={(e) => void saveRename(e)} className="mb-4 flex flex-wrap items-end gap-2 rounded-2xl border border-line bg-white p-3">
          <Field label="Название">
            <Input value={renameVal} onChange={(e) => setRenameVal(e.target.value)} required />
          </Field>
          <Button type="submit" disabled={busy === rename.id}>
            Сохранить
          </Button>
          <Button type="button" variant="ghost" onClick={() => setRename(null)}>
            Отмена
          </Button>
        </form>
      ) : null}

      <ErrorText>{error}</ErrorText>

      {jobs.length > 0 ? (
        <ul className="mb-4 space-y-2">
          {jobs.map((j) => (
            <li key={j.id} className="rounded-xl border border-line bg-white px-3 py-2">
              <ProgressBar
                value={j.pct}
                label={j.name}
                hint={j.status === "fail" ? j.error : j.status === "ok" ? "готово" : undefined}
              />
            </li>
          ))}
        </ul>
      ) : null}

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-white/60 px-6 py-16 text-center">
          <p className="font-serif text-xl text-navy">Пока пусто</p>
          <p className="mt-2 text-muted">Перетащите файлы сюда или нажмите «Добавить». Видео можно до 8 ГБ.</p>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((row) => {
            const card = toCard(row);
            return (
              <li key={row.id} className="group relative">
                <a
                  href={row.href}
                  className="block overflow-hidden rounded-2xl border border-line bg-white shadow-[var(--shadow)] hover:border-gold"
                >
                  <LibraryThumb item={card} className="aspect-[4/3] w-full" />
                  <div className="space-y-1 px-3 py-2">
                    <p className="line-clamp-2 font-semibold text-navy">{row.title}</p>
                    <p className="text-xs text-muted">
                      {row.isFolder ? "Папка" : row.kindLabel}
                      {row.sizeLabel ? ` · ${row.sizeLabel}` : ""}
                    </p>
                    <p className="text-xs text-muted">
                      {row.authorName}
                      {row.createdAt ? ` · ${fmtDate(row.createdAt)}` : ""}
                    </p>
                  </div>
                </a>
                <div className="absolute right-2 top-2 hidden gap-1 group-hover:flex">
                  <button
                    type="button"
                    className="rounded-lg bg-white/90 p-1.5 text-navy shadow hover:bg-gold hover:text-white"
                    title="Переименовать"
                    onClick={(e) => {
                      e.preventDefault();
                      setRename(row);
                      setRenameVal(row.title);
                    }}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    disabled={busy === row.id}
                    className="rounded-lg bg-white/90 p-1.5 text-navy shadow hover:bg-bad hover:text-white"
                    title="В корзину"
                    onClick={(e) => {
                      e.preventDefault();
                      void trash(row);
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
