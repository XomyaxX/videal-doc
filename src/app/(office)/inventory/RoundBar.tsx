"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card } from "@/components/ui";

export function RoundBar({
  round,
}: {
  round: { number: string; checked: number; total: number } | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  async function start() {
    setBusy("start");
    setErr("");
    const res = await fetch("/api/inventory/rounds", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) {
      setErr(data.error || "Не удалось открыть тур");
      return;
    }
    router.refresh();
  }

  async function close() {
    if (round && round.checked < round.total) {
      const ok = window.confirm(`В туре проверено ${round.checked} из ${round.total}. Закрыть тур?`);
      if (!ok) return;
    }
    setBusy("close");
    setErr("");
    const res = await fetch("/api/inventory/rounds/close", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) {
      setErr(data.error || "Не удалось закрыть тур");
      return;
    }
    router.refresh();
  }

  return (
    <Card className="mb-6">
      {round ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-semibold text-navy">Тур {round.number}</div>
            <p className="mt-1 text-sm text-muted">
              Проверено {round.checked} из {round.total}. В форме нового обхода только те, кого в этом туре ещё не закрыли.
            </p>
          </div>
          <Button type="button" variant="secondary" disabled={Boolean(busy)} onClick={() => void close()}>
            {busy === "close" ? "Закрываем…" : "Закрыть тур"}
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">Тур не открыт. Обход по одному сотруднику работает как раньше.</p>
          <Button type="button" disabled={Boolean(busy)} onClick={() => void start()}>
            {busy === "start" ? "Открываем…" : "Начать новый тур"}
          </Button>
        </div>
      )}
      {err ? <p className="mt-2 text-sm text-bad">{err}</p> : null}
    </Card>
  );
}
