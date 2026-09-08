"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { ReceiptScanPanel } from "@/components/ReceiptScanPanel";
import { ManualExpense } from "./ManualExpense";

export function AddReceipts({ reportId }: { reportId: string }) {
  const [mode, setMode] = useState<"choose" | "qr" | "manual">("choose");

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setMode("qr")}
          className={`rounded-2xl border p-5 text-left shadow-[var(--shadow)] ${
            mode === "qr" ? "border-gold bg-white" : "border-line bg-card hover:border-gold"
          }`}
        >
          <div className="font-serif text-2xl text-navy">QR кассового чека</div>
          <p className="mt-1 text-sm text-muted">Камера, фото или PDF. QR ФНС подставит сумму сам.</p>
        </button>
        <button
          type="button"
          onClick={() => setMode("manual")}
          className={`rounded-2xl border p-5 text-left shadow-[var(--shadow)] ${
            mode === "manual" ? "border-gold bg-white" : "border-line bg-card hover:border-gold"
          }`}
        >
          <div className="font-serif text-2xl text-navy">Составить с нуля</div>
          <p className="mt-1 text-sm text-muted">Нет QR: билет, накладная, товарный чек. Сумма руками, документов можно несколько.</p>
        </button>
      </div>

      {mode === "choose" ? (
        <p className="text-sm text-muted">Выберите, как загрузить расход — это и есть отчёт по чекам.</p>
      ) : null}
      {mode === "qr" ? <ReceiptScanPanel reportId={reportId} /> : null}
      {mode === "manual" ? <ManualExpense reportId={reportId} /> : null}
      {mode !== "choose" ? (
        <Button type="button" variant="ghost" onClick={() => setMode("choose")}>
          Другой способ загрузки
        </Button>
      ) : null}
    </div>
  );
}
