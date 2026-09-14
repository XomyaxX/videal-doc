"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ErrorText, Field, Input } from "@/components/ui";
import { CameraAttach } from "@/components/CameraAttach";
import { formatMoney, kopecksToRub } from "@/lib/money";
import { fmtDateTime } from "@/lib/dates";
import { RemoveReceipt } from "./RemoveReceipt";

export type ReceiptView = {
  id: string;
  merchant: string;
  amount: number;
  occurredAt: string | null;
  fn: string;
  fd: string;
  fp: string;
  note: string;
  sourceFileId: string | null;
  fileIds: string[];
};

function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Omsk",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export function ReceiptItem({
  reportId,
  canEdit,
  receipt,
}: {
  reportId: string;
  canEdit: boolean;
  receipt: ReceiptView;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = e.currentTarget;
    const fd = new FormData(form);
    fd.delete("file");
    fd.delete("files");
    for (const file of files) fd.append("file", file);
    const res = await fetch(`/api/advances/${reportId}/receipts/${receipt.id}`, { method: "PATCH", body: fd });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Не удалось сохранить");
      return;
    }
    setFiles([]);
    setOpen(false);
    router.refresh();
  }

  const fiscal = receipt.fn
    ? `ФН ${receipt.fn} · ФД ${receipt.fd || "—"} · ФП ${receipt.fp || "—"}`
    : receipt.fd
      ? `№ ${receipt.fd}`
      : "без QR";

  return (
    <div className="flex gap-4">
      {receipt.sourceFileId ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/files/${receipt.sourceFileId}?preview=1`}
          alt=""
          className="h-24 w-20 rounded-lg object-cover bg-paper"
        />
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="font-semibold">{receipt.merchant || "Расход"}</div>
          {canEdit ? (
            <div className="flex shrink-0 items-center gap-3">
              <button
                type="button"
                className="text-xs font-semibold text-muted hover:text-gold"
                onClick={() => {
                  setOpen((v) => !v);
                  setError("");
                  setFiles([]);
                }}
              >
                {open ? "закрыть" : "редактировать"}
              </button>
              <RemoveReceipt reportId={reportId} receiptId={receipt.id} />
            </div>
          ) : null}
        </div>
        {open ? (
          <form onSubmit={submit} className="mt-3 grid gap-3 sm:grid-cols-2">
            {error ? (
              <div className="sm:col-span-2">
                <ErrorText>{error}</ErrorText>
              </div>
            ) : null}
            <Field label="Что купили / документ">
              <Input name="merchant" required defaultValue={receipt.merchant} />
            </Field>
            <Field label="Сумма, ₽">
              <Input name="amount" required inputMode="decimal" defaultValue={kopecksToRub(receipt.amount)} />
            </Field>
            <Field label="Дата">
              <Input name="occurredAt" type="datetime-local" defaultValue={toLocalInput(receipt.occurredAt)} />
            </Field>
            <Field label="Номер документа">
              <Input name="fd" defaultValue={receipt.fd} placeholder="необязательно" />
            </Field>
            <Field label="Заметка">
              <Input name="note" defaultValue={receipt.note} />
            </Field>
            <div className="sm:col-span-2 space-y-2">
              <Field label="Ещё документы" hint="Уже прикреплённые остаются. Можно добавить фото, PDF или снимок с камеры.">
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
            <div className="sm:col-span-2 flex flex-wrap gap-2">
              <Button type="submit" disabled={busy}>
                {busy ? "Сохраняем…" : "Сохранить"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setOpen(false);
                  setError("");
                  setFiles([]);
                }}
              >
                Отмена
              </Button>
            </div>
          </form>
        ) : (
          <>
            <div className="text-sm text-muted">{fmtDateTime(receipt.occurredAt)}</div>
            <div className="text-lg">{formatMoney(receipt.amount)}</div>
            <div className="text-xs text-muted">{fiscal}</div>
            {receipt.note ? <div className="text-sm">{receipt.note}</div> : null}
          </>
        )}
        {receipt.fileIds.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-2">
            {receipt.fileIds.map((fid, i) => (
              <a key={fid} className="text-xs text-gold underline" href={`/api/files/${fid}`}>
                {receipt.fileIds.length === 1 ? "вложение" : `документ ${i + 1}`}
              </a>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
