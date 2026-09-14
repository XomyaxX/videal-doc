"use client";

import { useId, useState } from "react";
import { cn } from "./ui";

export const REQUEST_FILE_ACCEPT =
  ".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,.xls,.xlsx,image/*,application/pdf";

export type DroppedFile = { id: string; name: string; mime?: string; href?: string };

export function FileDrop({
  files,
  onAdd,
  onRemove,
  busy,
  compact,
  hint,
}: {
  files: DroppedFile[];
  onAdd: (list: File[]) => void;
  onRemove: (id: string) => void;
  busy?: boolean;
  compact?: boolean;
  hint?: string;
}) {
  const inputId = useId();
  const [over, setOver] = useState(false);

  function take(list: FileList | File[] | null) {
    if (!list || busy) return;
    const rows = Array.from(list).filter((f) => f && f.size > 0);
    if (rows.length) onAdd(rows);
  }

  return (
    <div>
      <label
        htmlFor={inputId}
        className={cn(
          "dropzone flex cursor-pointer flex-col items-center justify-center px-4 text-center",
          compact ? "min-h-[120px]" : "min-h-[160px]",
          over && "active",
          busy && "pointer-events-none opacity-70",
        )}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOver(true);
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOver(false);
          take(e.dataTransfer.files);
        }}
      >
        <div className={cn("font-serif text-navy", compact ? "text-lg" : "text-xl")}>
          Перетащите фото или документы
        </div>
        <p className="mt-1 text-sm text-muted">
          {hint || "Можно несколько сразу: фото, pdf, word, excel. Или нажмите, чтобы выбрать."}
        </p>
        <input
          id={inputId}
          type="file"
          multiple
          accept={REQUEST_FILE_ACCEPT}
          className="mt-3 max-w-full"
          disabled={busy}
          onChange={(e) => {
            take(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
      {files.length > 0 ? (
        <ul className="mt-2 divide-y divide-line rounded-xl border border-line bg-white px-3">
          {files.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              {f.href || !f.id.includes(".") ? (
                <a href={f.href || `/api/files/${f.id}`} className="min-w-0 truncate font-medium text-gold underline" target="_blank" rel="noreferrer">
                  {f.name}
                </a>
              ) : (
                <span className="min-w-0 truncate font-medium text-navy">{f.name}</span>
              )}
              <button
                type="button"
                className="shrink-0 text-muted hover:text-bad"
                onClick={() => onRemove(f.id)}
                disabled={busy}
              >
                убрать
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
