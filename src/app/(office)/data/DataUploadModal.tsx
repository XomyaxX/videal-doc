"use client";

import { useEffect, useRef, useState } from "react";
import { Upload, X } from "lucide-react";
import { Button, ErrorText } from "@/components/ui";
import { ProgressBar } from "@/components/ProgressBar";
import { uploadDataFile } from "@/lib/data-upload";

function formatBytes(n: number) {
  if (n < 1024) return `${n} Б`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} КБ`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(n >= 10 * 1024 * 1024 ? 0 : 1)} МБ`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} ГБ`;
}

type Row = {
  id: string;
  file: File;
  status: "wait" | "run" | "ok" | "fail";
  pct: number;
  error: string;
};

function statusLabel(row: Row) {
  if (row.status === "run") return `${row.pct}%`;
  if (row.status === "ok") return "на сервере";
  if (row.status === "fail") return row.error || "ошибка";
  return "в очереди";
}

export function DataUploadModal({
  dir,
  folderLabel,
  replaceName,
  initialFiles,
  onClose,
  onDone,
}: {
  dir: string;
  folderLabel: string;
  replaceName?: string;
  initialFiles?: File[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [over, setOver] = useState(false);
  const [error, setError] = useState("");
  const rowsRef = useRef<Row[]>([]);
  const pumping = useRef(false);
  const pick = useRef<HTMLInputElement>(null);

  function setList(next: Row[]) {
    rowsRef.current = next;
    setRows(next);
  }

  function patch(id: string, part: Partial<Row>) {
    setList(rowsRef.current.map((r) => (r.id === id ? { ...r, ...part } : r)));
  }

  const running = rows.some((r) => r.status === "run" || r.status === "wait");
  const finished = rows.length > 0 && rows.every((r) => r.status === "ok" || r.status === "fail");
  const okCount = rows.filter((r) => r.status === "ok").length;
  const failCount = rows.filter((r) => r.status === "fail").length;
  const totalBytes = rows.reduce((s, r) => s + r.file.size, 0);
  const sentBytes = rows.reduce((s, r) => {
    if (r.status === "ok") return s + r.file.size;
    if (r.status === "run") return s + Math.round((r.file.size * r.pct) / 100);
    return s;
  }, 0);
  const overall = totalBytes ? Math.round((sentBytes / totalBytes) * 100) : 0;

  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    if (initialFiles?.length) enqueue(initialFiles);
  }, [initialFiles]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !running) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [running, onClose]);

  function enqueue(list: File[]) {
    const incoming = list.filter((f) => f && f.size > 0);
    if (!incoming.length) return;
    if (replaceName) {
      const first = incoming[0];
      setList([{ id: `${first.name}-${first.size}-${first.lastModified}`, file: first, status: "wait", pct: 0, error: "" }]);
    } else {
      const next = [...rowsRef.current];
      for (const file of incoming) {
        if (next.some((r) => r.file.name === file.name && r.file.size === file.size && r.status !== "fail")) continue;
        next.push({
          id: `${file.name}-${file.size}-${file.lastModified}-${next.length}`,
          file,
          status: "wait",
          pct: 0,
          error: "",
        });
      }
      setList(next);
    }
    setError("");
    void pump();
  }

  async function ensureDest(file: File) {
    if (replaceName) return { dest: dir, fileName: replaceName };
    const relPath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    const parts = relPath.replace(/\\/g, "/").split("/").filter(Boolean);
    const fileName = parts.pop() || file.name;
    let dest = dir;
    for (const part of parts) {
      const res = await fetch("/api/data/folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dir: dest, name: part }),
      });
      const data = (await res.json().catch(() => ({}))) as { rel?: string; error?: string };
      if (!res.ok || !data.rel) throw new Error(data.error || "Не удалось создать папку");
      dest = data.rel;
    }
    return { dest, fileName };
  }

  async function pump() {
    if (pumping.current) return;
    pumping.current = true;
    let anyOk = false;
    try {
      while (true) {
        const next = rowsRef.current.find((r) => r.status === "wait");
        if (!next) break;
        const id = next.id;
        patch(id, { status: "run", pct: 1, error: "" });
        try {
          const { dest, fileName } = await ensureDest(next.file);
          await uploadDataFile({
            file: next.file,
            fileName,
            dir: dest,
            onProgress: (pct) => patch(id, { pct }),
          });
          anyOk = true;
          patch(id, { status: "ok", pct: 100 });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Не удалось загрузить";
          patch(id, { status: "fail", error: msg });
          setError(msg);
        }
      }
    } finally {
      pumping.current = false;
      if (anyOk) onDone();
      if (rowsRef.current.some((r) => r.status === "wait")) void pump();
    }
  }

  function retryFails() {
    setList(rowsRef.current.map((r) => (r.status === "fail" ? { ...r, status: "wait" as const, pct: 0, error: "" } : r)));
    setError("");
    void pump();
  }

  const title = replaceName ? `Замена: ${replaceName}` : "Загрузка на сервер";
  const hint = replaceName
    ? `Файл попадёт в ${folderLabel} вместо текущего.`
    : `Файлы пишутся в ${folderLabel} на диске студии.`;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-navy/50 p-0 sm:items-center sm:p-4"
      onClick={() => {
        if (!running) onClose();
      }}
    >
      <div
        className="flex max-h-[92vh] w-full flex-col rounded-t-3xl bg-card shadow-[var(--shadow)] sm:max-w-lg sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <p className="font-serif text-2xl text-navy">{title}</p>
            <p className="mt-1 text-sm text-muted">{hint}</p>
          </div>
          <button
            type="button"
            className="rounded-lg p-1 text-muted hover:bg-paper-2 hover:text-navy disabled:opacity-40"
            disabled={running}
            onClick={onClose}
            aria-label="Закрыть"
          >
            <X size={20} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <ErrorText>{error && failCount ? error : ""}</ErrorText>

          {!replaceName || rows.length === 0 ? (
            <label
              className={`dropzone mb-4 flex min-h-[140px] cursor-pointer flex-col items-center justify-center px-4 text-center ${
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
                enqueue([...e.dataTransfer.files]);
              }}
            >
              <Upload className="mb-2 text-gold" size={28} />
              <div className="font-serif text-xl text-navy">
                {replaceName ? "Выберите файл для замены" : "Перетащите файлы сюда"}
              </div>
              <p className="mt-1 text-sm text-muted">Или нажмите, чтобы выбрать с диска. Отправка начнётся сразу.</p>
              <input
                ref={pick}
                type="file"
                multiple={!replaceName}
                className="mt-3 max-w-full"
                onChange={(e) => {
                  enqueue([...(e.target.files || [])]);
                  e.target.value = "";
                }}
              />
            </label>
          ) : null}

          {rows.length > 0 ? (
            <>
              <ProgressBar
                value={overall}
                label={running ? "Отправка на сервер" : finished ? "Готово" : "Ожидание"}
                hint={`${formatBytes(sentBytes)} из ${formatBytes(totalBytes)}`}
                size="lg"
              />
              <ul className="mt-3 divide-y divide-line rounded-xl border border-line bg-white">
                {rows.map((row) => (
                  <li key={row.id} className="px-3 py-2">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate font-medium text-navy">{row.file.name}</span>
                      <span className={`shrink-0 tabular-nums ${row.status === "fail" ? "text-bad" : "text-muted"}`}>
                        {statusLabel(row)}
                      </span>
                    </div>
                    <p className="text-xs text-muted">{formatBytes(row.file.size)}</p>
                    {row.status === "run" || row.status === "ok" ? (
                      <div className="mt-1">
                        <ProgressBar value={row.pct} size="sm" />
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          {failCount ? (
            <Button type="button" variant="secondary" disabled={running} onClick={retryFails}>
              Повторить ошибки
            </Button>
          ) : null}
          {finished ? (
            <Button type="button" onClick={onClose}>
              Готово{okCount ? ` · ${okCount}` : ""}
            </Button>
          ) : (
            <Button type="button" variant="ghost" disabled={running} onClick={onClose}>
              Отмена
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
