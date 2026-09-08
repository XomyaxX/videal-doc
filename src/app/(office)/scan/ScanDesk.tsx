"use client";

import { useMemo, useState } from "react";
import { Button, Card, Field, Input, Select } from "@/components/ui";
import { scanFiles, type ScanHit } from "@/lib/scan-client";
import { parseFnsQr } from "@/lib/qr";
import { formatMoney, kopecksToRub } from "@/lib/money";

type Draft = {
  hit: ScanHit;
  date: string;
  amount: string;
  merchant: string;
  fn: string;
  fd: string;
  fp: string;
  note: string;
  file: File;
};

export function ScanDesk({
  drafts,
  reports,
}: {
  drafts: { id: string; number: string }[];
  reports: { id: string; number: string }[];
}) {
  const [items, setItems] = useState<Draft[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [reportId, setReportId] = useState(drafts[0]?.id || "");
  const [purpose, setPurpose] = useState("");

  async function onFiles(list: FileList | File[]) {
    const files = Array.from(list);
    if (files.length === 0) return;
    setBusy(true);
    setMsg("Ищем QR на фото и в PDF…");
    const hits = await scanFiles(files, setMsg);
    const mapped: Draft[] = hits.map((hit, i) => {
      const parsed = hit.qrRaw ? parseFnsQr(hit.qrRaw) : null;
      const file = files.find((f) => f.name === hit.fileName) || files[0];
      return {
        hit,
        date: parsed?.occurredAt ? parsed.occurredAt.toISOString().slice(0, 16) : "",
        amount: parsed ? kopecksToRub(parsed.amount) : "",
        merchant: parsed?.merchant || "",
        fn: parsed?.fn || "",
        fd: parsed?.fd || "",
        fp: parsed?.fp || "",
        note: hit.qrRaw ? "" : "QR не найден — заполните вручную",
        file,
      };
    });
    setItems((prev) => [...mapped, ...prev]);
    setBusy(false);
    setMsg(`Распознано файлов: ${hits.length}`);
  }

  const total = useMemo(
    () => items.reduce((s, i) => s + Math.round(Number(i.amount.replace(",", ".")) * 100 || 0), 0),
    [items],
  );

  async function save() {
    setBusy(true);
    setMsg("");
    let target = reportId;
    if (!target) {
      const created = await fetch("/api/advances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose }),
      });
      const data = await created.json();
      if (!created.ok) {
        setMsg(data.error || "Не удалось создать отчёт");
        setBusy(false);
        return;
      }
      target = data.id;
    }
    for (const item of items) {
      const fd = new FormData();
      fd.set("file", item.file);
      fd.set("qrRaw", item.hit.qrRaw);
      fd.set("occurredAt", item.date);
      fd.set("amount", item.amount);
      fd.set("merchant", item.merchant);
      fd.set("fn", item.fn);
      fd.set("fd", item.fd);
      fd.set("fp", item.fp);
      fd.set("note", item.note);
      const res = await fetch(`/api/advances/${target}/receipts`, { method: "POST", body: fd });
      if (!res.ok) {
        const data = await res.json();
        setMsg(data.error || "Ошибка чека");
        setBusy(false);
        return;
      }
    }
    window.location.href = `/advances/${target}`;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div>
        <label
          className="dropzone flex min-h-[240px] cursor-pointer flex-col items-center justify-center px-6 text-center"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            onFiles(e.dataTransfer.files);
          }}
        >
          <div className="font-serif text-2xl text-navy">Бросьте фото или PDF чеков</div>
          <p className="mt-2 max-w-md text-muted">
            Можно сразу пачку. QR с кассового чека ФНС читается с фотографии и с каждой страницы PDF. Если QR не
            нашёлся — заполните сумму руками, файл всё равно приложится.
          </p>
          <input
            type="file"
            multiple
            accept="image/*,.pdf,application/pdf"
            className="mt-4"
            onChange={(e) => e.target.files && onFiles(e.target.files)}
          />
        </label>
        {msg ? <p className="mt-3 text-sm text-muted">{msg}</p> : null}

        <div className="mt-4 space-y-3">
          {items.map((item, idx) => (
            <Card key={idx}>
              <div className="flex gap-4">
                {item.file.type.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.hit.previewUrl} alt="" className="h-28 w-24 rounded-lg object-cover" />
                ) : (
                  <div className="flex h-28 w-24 items-center justify-center rounded-lg bg-paper text-sm">PDF</div>
                )}
                <div className="grid flex-1 gap-2 sm:grid-cols-2">
                  <Field label="Сумма, ₽">
                    <Input value={item.amount} onChange={(e) => update(idx, { amount: e.target.value })} />
                  </Field>
                  <Field label="Дата">
                    <Input type="datetime-local" value={item.date} onChange={(e) => update(idx, { date: e.target.value })} />
                  </Field>
                  <Field label="Продавец">
                    <Input value={item.merchant} onChange={(e) => update(idx, { merchant: e.target.value })} />
                  </Field>
                  <Field label="Заметка">
                    <Input value={item.note} onChange={(e) => update(idx, { note: e.target.value })} />
                  </Field>
                  <p className="sm:col-span-2 text-xs text-muted">
                    {item.hit.qrRaw ? `QR: ${item.hit.qrRaw}` : "QR не найден"} · ФН {item.fn || "—"} · ФД {item.fd || "—"}
                  </p>
                </div>
                <button className="text-sm text-bad" onClick={() => setItems((p) => p.filter((_, i) => i !== idx))}>
                  убрать
                </button>
              </div>
            </Card>
          ))}
        </div>
      </div>

      <Card className="h-fit">
        <h2 className="font-serif text-xl text-navy">Куда положить</h2>
        <div className="mt-3 space-y-3">
          <Field label="Существующий черновик">
            <Select value={reportId} onChange={(e) => setReportId(e.target.value)}>
              <option value="">Создать новый отчёт</option>
              {reports.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.number}
                </option>
              ))}
            </Select>
          </Field>
          {!reportId ? (
            <Field label="Назначение аванса">
              <Input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Хознужды, командировка…" />
            </Field>
          ) : null}
          <p className="text-lg font-semibold">Итого: {formatMoney(total)}</p>
          <Button className="w-full" disabled={busy || items.length === 0} onClick={save}>
            {busy ? "Сохраняем…" : "Добавить в авансовый"}
          </Button>
        </div>
      </Card>
    </div>
  );

  function update(idx: number, patch: Partial<Draft>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
}
