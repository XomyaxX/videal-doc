"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, ErrorText, Field, Input, Select, Textarea } from "@/components/ui";
import {
  WRITEOFF_REASONS,
  WRITEOFF_REASON,
  defaultWriteOffCommission,
  type CommissionMember,
  type WriteOffPickItem,
} from "@/lib/writeoff";

export function WriteOffNewForm({ today, items }: { today: string; items: WriteOffPickItem[] }) {
  const router = useRouter();
  const [actDate, setActDate] = useState(today);
  const [reason, setReason] = useState("unusable");
  const [reasonText, setReasonText] = useState("");
  const [basis, setBasis] = useState("");
  const [note, setNote] = useState("");
  const [commission, setCommission] = useState<CommissionMember[]>(defaultWriteOffCommission());
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const shown = useMemo(() => {
    const s = q.trim().toLocaleLowerCase("ru");
    if (!s) return items;
    return items.filter((it) => `${it.invNo} ${it.name} ${it.holder}`.toLocaleLowerCase("ru").includes(s));
  }, [items, q]);

  function toggle(id: string) {
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setErr("");
    const res = await fetch("/api/inventory/writeoff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actDate, reason, reasonText, basis, note, commission, itemIds: picked }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(data.error || "Не создалось");
      setBusy(false);
      return;
    }
    router.push(`/inventory/writeoff/${data.id}`);
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit(e);
      }}
      className="space-y-4"
    >
      <Card>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Дата акта">
            <Input type="date" value={actDate} onChange={(e) => setActDate(e.target.value)} required />
          </Field>
          <Field label="Причина">
            <Select value={reason} onChange={(e) => setReason(e.target.value)}>
              {WRITEOFF_REASONS.map((code) => (
                <option key={code} value={code}>
                  {WRITEOFF_REASON[code]}
                </option>
              ))}
            </Select>
          </Field>
          {reason === "other" ? (
            <Field label="Текст причины" hint="Обязателен, чтобы закрыть акт">
              <Input value={reasonText} onChange={(e) => setReasonText(e.target.value)} />
            </Field>
          ) : null}
          <Field label="Основание" hint="Приказ, докладная — по желанию">
            <Input value={basis} onChange={(e) => setBasis(e.target.value)} />
          </Field>
          <div className="md:col-span-2">
            <Field label="Примечание">
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </div>
        </div>
      </Card>
      <Card>
        <h2 className="font-serif text-xl text-navy">Комиссия</h2>
        <p className="mt-1 text-sm text-muted">Три подписи. Для закрытия достаточно одного ФИО. Первая строка — председатель.</p>
        <ul className="mt-3 space-y-2">
          {commission.map((m, i) => (
            <li key={i} className="grid gap-2 md:grid-cols-[1fr_1fr]">
              <Input
                value={m.fio}
                placeholder={i === 0 ? "ФИО председателя" : "ФИО члена комиссии"}
                onChange={(e) => setCommission((c) => c.map((x, j) => (j === i ? { ...x, fio: e.target.value } : x)))}
              />
              <Input
                value={m.position}
                placeholder="Должность"
                onChange={(e) => setCommission((c) => c.map((x, j) => (j === i ? { ...x, position: e.target.value } : x)))}
              />
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="font-serif text-xl text-navy">Позиции</h2>
          <p className="text-sm text-muted">Выбрано: {picked.length}</p>
        </div>
        <Input className="mt-3" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск: инв. №, название, держатель" />
        {shown.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Нет свободных позиций. Акт можно сохранить пустым и добавить строки на карточке.</p>
        ) : (
          <ul className="mt-3 max-h-80 divide-y divide-line overflow-y-auto">
            {shown.map((it) => (
              <li key={it.id}>
                <label className="flex cursor-pointer items-start gap-3 py-2">
                  <input type="checkbox" className="mt-1" checked={picked.includes(it.id)} onChange={() => toggle(it.id)} />
                  <span>
                    <span className="font-semibold text-navy">
                      {it.invNo ? `${it.invNo} · ` : ""}
                      {it.name}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted">
                      {it.holder || "без держателя"} · {it.qty} шт.
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <ErrorText>{err}</ErrorText>
      <div className="flex gap-2">
        <Button type="button" disabled={busy} onClick={() => void submit()}>
          {busy ? "Сохраняем…" : "Сохранить"}
        </Button>
        <Button type="button" variant="secondary" href="/inventory">
          Отмена
        </Button>
      </div>
    </form>
  );
}
