"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, ErrorText } from "@/components/ui";
import { LibraryThumb, type LibraryCard } from "@/components/LibraryPreview";
import { fmtDateTime } from "@/lib/dates";
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
    thumbUrl: "",
    fileUrl: "",
    href: "#",
    isFolder: row.isFolder,
  };
}

type LooseFile = {
  id: string;
  itemId: string;
  originalName: string;
  sizeLabel: string;
  deletedAt: string | null;
  title: string;
};

export function LearnTrashDesk({
  items,
  files,
  canPurge,
}: {
  items: TrainingCard[];
  files: LooseFile[];
  canPurge: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function act(id: string, action: "restore" | "purge") {
    if (action === "purge" && !confirm("Стереть навсегда? Файл удалится с диска, вернуть будет нельзя.")) return;
    setBusy(`${action}-${id}`);
    setError("");
    const res = await fetch(`/api/learn/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy("");
    if (!res.ok) {
      setError(data.error || "Не удалось");
      return;
    }
    router.refresh();
  }

  async function actFile(itemId: string, fileId: string, action: "restore" | "purge") {
    if (action === "purge" && !confirm("Стереть файл навсегда? Вернуть будет нельзя.")) return;
    setBusy(`${action}-${fileId}`);
    setError("");
    const res = await fetch(`/api/learn/${itemId}/file/${fileId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy("");
    if (!res.ok) {
      setError(data.error || "Не удалось");
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <div className="mb-4">
        <Button href="/learn" variant="secondary">
          К обучению
        </Button>
      </div>
      <ErrorText>{error}</ErrorText>
      {items.length === 0 && files.length === 0 ? (
        <Card>Корзина пуста.</Card>
      ) : (
        <>
      {files.length > 0 ? (
        <ul className="mb-6 space-y-3">
          {files.map((f) => (
            <li key={f.id}>
              <Card className="flex flex-wrap items-center gap-4">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-navy">{f.originalName}</p>
                  <p className="text-sm text-muted">
                    файл из «{f.title}»
                    {f.sizeLabel ? ` · ${f.sizeLabel}` : ""}
                    {f.deletedAt ? ` · убрали ${fmtDateTime(f.deletedAt)}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={Boolean(busy)}
                    onClick={() => void actFile(f.itemId, f.id, "restore")}
                  >
                    {busy === `restore-${f.id}` ? "…" : "Восстановить"}
                  </Button>
                  {canPurge ? (
                    <Button
                      type="button"
                      variant="danger"
                      disabled={Boolean(busy)}
                      onClick={() => void actFile(f.itemId, f.id, "purge")}
                    >
                      {busy === `purge-${f.id}` ? "…" : "Стереть"}
                    </Button>
                  ) : null}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      ) : null}
      {items.length === 0 ? null : (
        <ul className="space-y-3">
          {items.map((row) => (
            <li key={row.id}>
              <Card className="flex flex-wrap items-center gap-4">
                <div className="h-16 w-24 overflow-hidden rounded-lg">
                  <LibraryThumb item={toCard(row)} className="h-full w-full" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-navy">{row.title}</p>
                  <p className="text-sm text-muted">
                    {row.isFolder ? "Папка" : row.kindLabel}
                    {row.sizeLabel ? ` · ${row.sizeLabel}` : ""}
                    {row.deletedAt ? ` · убрали ${fmtDateTime(row.deletedAt)}` : ""}
                  </p>
                  {row.files.length > 0 ? (
                    <p className="mt-1 truncate text-xs text-muted">{row.files.map((f) => f.originalName).join(", ")}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={Boolean(busy)}
                    onClick={() => void act(row.id, "restore")}
                  >
                    {busy === `restore-${row.id}` ? "…" : "Восстановить"}
                  </Button>
                  {canPurge ? (
                    <Button
                      type="button"
                      variant="danger"
                      disabled={Boolean(busy)}
                      onClick={() => void act(row.id, "purge")}
                    >
                      {busy === `purge-${row.id}` ? "…" : "Стереть"}
                    </Button>
                  ) : null}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
        </>
      )}
    </div>
  );
}
