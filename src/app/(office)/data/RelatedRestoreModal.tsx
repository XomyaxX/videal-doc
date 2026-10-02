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

export function RelatedRestoreModal({
  rootRel,
  onClose,
  onDone,
}: {
  rootRel: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [replaceGlobal, setReplaceGlobal] = useState(false);
  const [pct, setPct] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ written: string[]; skippedGlobal: string[]; remapped: number } | null>(null);
  const pick = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  function take(list: File[]) {
    const next = list.find((f) => f && f.size > 0);
    if (!next) return;
    setFile(next);
    setError("");
    setResult(null);
    setPct(0);
  }

  async function run() {
    if (!file || busy) return;
    if (!/\.zip$/i.test(file.name)) {
      setError("Нужен zip, который скачали кнопкой «Скачать всё связанное»");
      return;
    }
    setBusy(true);
    setError("");
    setResult(null);
    setPct(1);
    try {
      const last = await uploadDataFile({
        file,
        fileName: file.name,
        extra: {
          relatedRestore: "1",
          rootRel,
          replaceGlobal: replaceGlobal ? "1" : "0",
        },
        onProgress: (n) => setPct(n),
      });
      const written = last.written || [];
      const skippedGlobal = last.skippedGlobal || [];
      const remapped = last.remapped || 0;
      if (!written.length) throw new Error(last.error || "В архиве нечего возвращать");
      setResult({ written, skippedGlobal, remapped });
      setPct(100);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось вернуть архив");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-navy/50 p-0 sm:items-center sm:p-4"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="flex max-h-[92vh] w-full flex-col rounded-t-3xl bg-card shadow-[var(--shadow)] sm:max-w-lg sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <p className="font-serif text-2xl text-navy">Вернуть архив связанных</p>
            <p className="mt-1 text-sm text-muted">
              Залейте тот же zip. Пути внутри .blend снова станут студийными. Файлы из Global по умолчанию не
              перезаписываются.
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg p-1 text-muted hover:bg-paper-2 hover:text-navy disabled:opacity-40"
            disabled={busy}
            onClick={onClose}
            aria-label="Закрыть"
          >
            <X size={20} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <ErrorText>{error}</ErrorText>

          <label
            className="dropzone mb-4 flex min-h-[120px] cursor-pointer flex-col items-center justify-center px-4 text-center"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              take([...e.dataTransfer.files]);
            }}
          >
            <Upload className="mb-2 text-gold" size={28} />
            <div className="font-serif text-xl text-navy">Перетащите zip сюда</div>
            <p className="mt-1 text-sm text-muted">Или нажмите, чтобы выбрать архив с ноутбука.</p>
            <input
              ref={pick}
              type="file"
              accept=".zip,application/zip"
              className="mt-3 max-w-full"
              onChange={(e) => {
                take([...(e.target.files || [])]);
                e.target.value = "";
              }}
            />
          </label>

          {file ? (
            <p className="mb-3 text-sm text-navy">
              {file.name} · {formatBytes(file.size)}
            </p>
          ) : null}

          <label className="mb-4 flex items-start gap-2 text-sm text-navy">
            <input
              type="checkbox"
              className="mt-1"
              checked={replaceGlobal}
              disabled={busy}
              onChange={(e) => setReplaceGlobal(e.target.checked)}
            />
            <span>Заменить библиотеки Global. Без галочки общие персонажи и материалы студии не трогаем.</span>
          </label>

          {busy || result ? (
            <ProgressBar
              value={pct}
              label={busy ? "Возвращаю на диск студии" : "Готово"}
              hint={file ? formatBytes(file.size) : ""}
              size="lg"
            />
          ) : null}

          {result ? (
            <div className="mt-3 space-y-1 text-sm text-navy">
              <p>
                Вернул {result.written.length} файл{result.written.length === 1 ? "" : "ов"}.
                {result.remapped ? ` Пути внутри .blend снова студийные (${result.remapped}).` : ""}
              </p>
              {result.skippedGlobal.length ? (
                <p className="text-muted">
                  Global не трогали: {result.skippedGlobal.length}. Отметьте «Заменить библиотеки Global», если их тоже
                  нужно перезаписать.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          {result ? (
            <Button type="button" onClick={onClose}>
              Готово
            </Button>
          ) : (
            <>
              <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
                Отмена
              </Button>
              <Button type="button" disabled={busy || !file} onClick={() => void run()}>
                {busy ? "Возвращаю…" : "Вернуть на диск"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
