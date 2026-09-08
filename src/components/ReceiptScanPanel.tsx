"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Card, ErrorText, Field, Input } from "@/components/ui";
import { scanFiles, scanQrFromCanvas, type ScanHit } from "@/lib/scan-client";
import { parseFnsQr } from "@/lib/qr";
import { kopecksToRub } from "@/lib/money";

export type ScannedReceipt = {
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

function hitToItem(hit: ScanHit, file: File): ScannedReceipt {
  const parsed = hit.qrRaw ? parseFnsQr(hit.qrRaw) : null;
  return {
    hit,
    date: parsed?.occurredAt ? parsed.occurredAt.toISOString().slice(0, 16) : "",
    amount: parsed ? kopecksToRub(parsed.amount) : "",
    merchant: parsed?.merchant || "",
    fn: parsed?.fn || "",
    fd: parsed?.fd || "",
    fp: parsed?.fp || "",
    note: hit.qrRaw ? "" : "QR не найден — заполните сумму",
    file,
  };
}

export function ReceiptScanPanel({
  reportId,
  onCaptured,
}: {
  reportId?: string;
  onCaptured?: (items: ScannedReceipt[]) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const camFileRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopRef = useRef(0);
  const [camera, setCamera] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState<ScannedReceipt[]>([]);

  function stopCamera() {
    cancelAnimationFrame(loopRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamera(false);
  }

  useEffect(() => () => stopCamera(), []);

  async function startCamera() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      setCamera(true);
    } catch {
      setError("Камера недоступна. Разрешите доступ или загрузите фото чека.");
      camFileRef.current?.click();
    }
  }

  useEffect(() => {
    if (!camera || !videoRef.current || !streamRef.current) return;
    const video = videoRef.current;
    video.srcObject = streamRef.current;
    video.play().catch(() => {});
    const canvas = document.createElement("canvas");
    let last = 0;
    let locked = false;

    function tick(ts: number) {
      loopRef.current = requestAnimationFrame(tick);
      if (locked || ts - last < 180) return;
      last = ts;
      if (!video.videoWidth) return;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0);
      const qrs = scanQrFromCanvas(canvas);
      if (qrs.length === 0) return;
      locked = true;
      canvas.toBlob((blob) => {
        if (!blob) {
          locked = false;
          return;
        }
        const file = new File([blob], `qr-${Date.now()}.jpg`, { type: "image/jpeg" });
        const previewUrl = URL.createObjectURL(blob);
        const items = qrs.map((qrRaw) => hitToItem({ fileName: file.name, previewUrl, qrRaw, page: 1 }, file));
        stopCamera();
        takeItems(items);
      }, "image/jpeg", 0.9);
    }
    loopRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(loopRef.current);
  }, [camera]);

  async function takeItems(items: ScannedReceipt[]) {
    if (onCaptured) {
      onCaptured(items);
      setMsg(`QR прочитан, чеков: ${items.length}`);
      return;
    }
    setPending((prev) => [...items, ...prev]);
    setMsg(`QR прочитан, чеков: ${items.length}. Проверьте сумму и нажмите «Положить в отчёт».`);
  }

  async function onFiles(list: FileList | File[]) {
    const files = Array.from(list);
    if (!files.length) return;
    setBusy(true);
    setError("");
    setMsg("Ищем QR…");
    const hits = await scanFiles(files, setMsg);
    const mapped = hits.map((hit) => {
      const file = files.find((f) => f.name === hit.fileName) || files[0];
      return hitToItem(hit, file);
    });
    setBusy(false);
    await takeItems(mapped);
  }

  async function savePending() {
    if (!reportId) return;
    setBusy(true);
    setError("");
    for (const item of pending) {
      if (!item.amount || Number(item.amount.replace(",", ".")) <= 0) {
        setError("Укажите сумму по каждому чеку");
        setBusy(false);
        return;
      }
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
      const res = await fetch(`/api/advances/${reportId}/receipts`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Не удалось добавить чек");
        setBusy(false);
        return;
      }
    }
    window.location.reload();
  }

  return (
    <Card>
      <h2 className="font-serif text-xl text-navy">Отсканировать QR чека</h2>
      <p className="mt-1 text-sm text-muted">
        Камера читает QR ФНС с кассового чека. Можно также сфотографировать или загрузить PDF.
      </p>
      <ErrorText>{error}</ErrorText>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" variant="gold" onClick={startCamera} disabled={busy}>
          Отсканировать QR
        </Button>
        <Button type="button" variant="secondary" onClick={() => camFileRef.current?.click()} disabled={busy}>
          Сфотографировать
        </Button>
        <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()} disabled={busy}>
          Загрузить фото / PDF
        </Button>
      </div>
      <input
        ref={camFileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => e.target.files && onFiles(e.target.files)}
      />
      <input
        ref={fileRef}
        type="file"
        multiple
        accept="image/*,.pdf,application/pdf"
        className="hidden"
        onChange={(e) => e.target.files && onFiles(e.target.files)}
      />
      {msg ? <p className="mt-2 text-sm text-muted">{msg}</p> : null}

      {camera ? (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 p-4">
          <video ref={videoRef} autoPlay playsInline muted className="max-h-[70vh] w-full max-w-lg rounded-2xl bg-black" />
          <p className="mt-3 text-white">Наведите камеру на QR кассового чека</p>
          <Button type="button" variant="secondary" className="mt-4" onClick={stopCamera}>
            Закрыть камеру
          </Button>
        </div>
      ) : null}

      {reportId && pending.length > 0 ? (
        <div className="mt-4 space-y-3">
          {pending.map((item, idx) => (
            <div key={`${item.file.name}-${idx}`} className="grid gap-2 rounded-xl border border-line bg-white p-3 sm:grid-cols-2">
              <Field label="Сумма, ₽">
                <Input
                  value={item.amount}
                  onChange={(e) =>
                    setPending((prev) => prev.map((it, i) => (i === idx ? { ...it, amount: e.target.value } : it)))
                  }
                />
              </Field>
              <Field label="Продавец">
                <Input
                  value={item.merchant}
                  onChange={(e) =>
                    setPending((prev) => prev.map((it, i) => (i === idx ? { ...it, merchant: e.target.value } : it)))
                  }
                />
              </Field>
              <p className="text-xs text-muted sm:col-span-2">{item.hit.qrRaw ? "QR прочитан" : "без QR"}</p>
            </div>
          ))}
          <Button type="button" onClick={savePending} disabled={busy}>
            {busy ? "Сохраняем…" : "Положить в отчёт"}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
