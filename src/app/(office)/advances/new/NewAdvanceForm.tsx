"use client";

import { useMemo, useState } from "react";
import { Button, Card, ErrorText, Field, Input } from "@/components/ui";
import { formatMoney, kopecksToRub } from "@/lib/money";

type FundOpt = { id: string; number: string; purpose: string; amount: number };

function purposeOf(funds: FundOpt[], ids: string[]) {
  const set = Array.from(
    new Set(funds.filter((f) => ids.includes(f.id)).map((f) => f.purpose.trim()).filter(Boolean)),
  );
  if (set.length === 1) return set[0];
  return "";
}

export function NewAdvanceForm({ funds, preselect }: { funds: FundOpt[]; preselect: string[] }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const start = preselect.filter((id) => funds.some((f) => f.id === id));
  const [selected, setSelected] = useState<string[]>(start);
  const [purpose, setPurpose] = useState(purposeOf(funds, start));
  const [issued, setIssued] = useState("");
  const picked = funds.filter((f) => selected.includes(f.id));
  const fundSum = useMemo(() => picked.reduce((s, f) => s + f.amount, 0), [picked]);
  const mixed = new Set(picked.map((f) => f.purpose.trim() || "Без направления")).size > 1;
  const groups = useMemo(() => {
    const map = new Map<string, FundOpt[]>();
    for (const f of funds) {
      const key = f.purpose.trim() || "Без направления";
      const list = map.get(key) || [];
      list.push(f);
      map.set(key, list);
    }
    return Array.from(map.entries());
  }, [funds]);

  function setIds(next: string[]) {
    setSelected(next);
    const nextPurpose = purposeOf(funds, next);
    if (nextPurpose) setPurpose(nextPurpose);
  }

  async function submit() {
    setBusy(true);
    setError("");
    if (funds.length > 0 && selected.length === 0) {
      setError("Выберите хотя бы один запрос средств");
      setBusy(false);
      return;
    }
    const created = await fetch("/api/advances", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        purpose,
        issuedAmount: selected.length ? undefined : issued,
        fundIds: selected,
      }),
    });
    const data = await created.json();
    setBusy(false);
    if (!created.ok) {
      setError(data.error || "Не удалось создать отчёт");
      return;
    }
    window.location.href = `/advances/${data.id}`;
  }

  return (
    <div className="max-w-xl space-y-4">
      <ErrorText>{error}</ErrorText>
      {funds.length > 0 ? (
        <Card>
          <h2 className="font-serif text-xl text-navy">Запросы в этом отчёте</h2>
          <p className="mt-1 text-sm text-muted">После создания приложите чеки: QR или расход с нуля.</p>
          <div className="mt-3 space-y-3">
            {groups.map(([label, rows]) => (
              <div key={label} className="rounded-xl border border-line bg-white p-2">
                <div className="mb-1 px-2 text-sm font-semibold text-navy">{label}</div>
                {rows.map((f) => {
                  const on = selected.includes(f.id);
                  return (
                    <label
                      key={f.id}
                      className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-paper"
                    >
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={on}
                        onChange={() => setIds(on ? selected.filter((x) => x !== f.id) : [...selected, f.id])}
                      />
                      <span>
                        <span className="font-semibold">{f.number}</span>
                        <span className="mt-0.5 block text-sm text-muted">{formatMoney(f.amount)}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            ))}
          </div>
          {mixed ? (
            <p className="mt-2 text-sm text-wait">Выбраны разные направления — лучше сделать отдельные отчёты.</p>
          ) : null}
          {selected.length > 0 ? (
            <p className="mt-3 text-sm text-muted">
              Получено под отчёт: <span className="font-semibold text-navy">{formatMoney(fundSum)}</span>
            </p>
          ) : null}
        </Card>
      ) : (
        <Card>
          <Field label="Получено под отчёт, ₽">
            <Input value={issued} onChange={(e) => setIssued(e.target.value)} placeholder="0.00" />
          </Field>
        </Card>
      )}
      <Card>
        <Field label="Назначение отчёта">
          <Input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Хознужды, закупка…" />
        </Field>
      </Card>
      <Button type="button" disabled={busy || (funds.length > 0 && selected.length === 0)} onClick={submit} className="h-12 px-8">
        {busy ? "Создаём…" : "Дальше: приложить чеки"}
      </Button>
    </div>
  );
}
