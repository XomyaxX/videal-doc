"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Card, ErrorText } from "@/components/ui";
import { LibraryPicker } from "@/components/LibraryPicker";
import { LibraryThumb, LibraryViewer, type LibraryCard } from "@/components/LibraryPreview";

export function TaskLibrary({
  taskId,
  items,
  canLead,
}: {
  taskId: string;
  items: LibraryCard[];
  canLead: boolean;
}) {
  const [edit, setEdit] = useState(false);
  const [selected, setSelected] = useState(items.map((i) => i.id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<string | null>(items[0]?.id || null);

  async function save() {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/prod/tasks/${taskId}/library`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemIds: selected }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) setError(data.error || "Не удалось сохранить");
    else window.location.reload();
  }

  return (
    <Card className="bd-card">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-serif text-xl text-navy">Материалы из хранилища</h2>
        {canLead ? (
          <Button type="button" variant="secondary" className="px-3 py-1.5 text-sm" onClick={() => setEdit((v) => !v)}>
            {edit ? "Отмена" : "Прикрепить"}
          </Button>
        ) : null}
      </div>
      <ErrorText>{error}</ErrorText>
      {edit ? (
        <div className="mt-3 space-y-3">
          <LibraryPicker selected={selected} onChange={setSelected} />
          <Button type="button" disabled={busy} onClick={save}>
            Сохранить в задаче
          </Button>
        </div>
      ) : items.length === 0 ? (
        <p className="mt-2 text-sm text-muted">
          Пока ничего не прикреплено. Руководитель выбирает файлы из{" "}
          <Link href="/library" className="font-semibold underline">
            хранилища
          </Link>
          .
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setOpenId(item.id)}
                className={`overflow-hidden rounded-xl border text-left ${
                  openId === item.id ? "border-gold" : "border-line"
                }`}
              >
                <LibraryThumb item={item} className="h-24 w-full" />
                <div className="truncate px-2 py-1 text-sm font-semibold text-navy">{item.title}</div>
                {item.fileCount && item.fileCount > 1 ? (
                  <div className="px-2 pb-1 text-xs text-muted">{item.fileCount} файлов</div>
                ) : null}
              </button>
            ))}
          </div>
          {openId ? (
            <div>
              {items
                .filter((i) => i.id === openId)
                .map((item) => (
                  <div key={item.id} className="space-y-2">
                    <LibraryViewer item={item} />
                    <p className="text-sm text-muted">{item.description}</p>
                    <div className="flex flex-wrap gap-2 text-sm">
                      <Link href={item.href} className="font-semibold text-navy underline">
                        Карточка в хранилище
                      </Link>
                      <a href={item.fileUrl} className="font-semibold text-navy underline">
                        Скачать
                      </a>
                    </div>
                    {item.uncPath ? <div className="break-all font-mono text-xs text-muted">{item.uncPath}</div> : null}
                  </div>
                ))}
            </div>
          ) : (
            <p className="text-sm text-muted">Нажмите на превью, чтобы открыть крупно.</p>
          )}
        </div>
      )}
    </Card>
  );
}
