"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, ErrorText, Field, Input, Pill, Select, Textarea } from "@/components/ui";
import {
  WRITEOFF_REASON,
  WRITEOFF_REASONS,
  WRITEOFF_STATUS,
  reasonLabel,
  type CommissionMember,
  type WriteOffLineDTO,
  type WriteOffPickItem,
  type WriteOffSheetDTO,
} from "@/lib/writeoff";

export function WriteOffCard({
  initial,
  candidates,
}: {
  initial: WriteOffSheetDTO;
  candidates: WriteOffPickItem[];
}) {
  const router = useRouter();
  const [sheet, setSheet] = useState(initial);
  const [actDate, setActDate] = useState(initial.actDate);
  const [reason, setReason] = useState(initial.reason);
  const [reasonText, setReasonText] = useState(initial.reasonText);
  const [basis, setBasis] = useState(initial.basis);
  const [note, setNote] = useState(initial.note);
  const [commission, setCommission] = useState<CommissionMember[]>(initial.commission);
  const [lines, setLines] = useState<WriteOffLineDTO[]>(initial.lines);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [manualTitle, setManualTitle] = useState("");
  const [manualInv, setManualInv] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const open = sheet.status === "open";
  const st = WRITEOFF_STATUS[sheet.status] || WRITEOFF_STATUS.open;

  async function send(url: string, method: string, body?: unknown) {
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(data.error || "Не сохранилось");
      return null;
    }
    return data as { sheet?: WriteOffSheetDTO };
  }

  function apply(next: WriteOffSheetDTO) {
    setSheet(next);
    setActDate(next.actDate);
    setReason(next.reason);
    setReasonText(next.reasonText);
    setBasis(next.basis);
    setNote(next.note);
    setCommission(next.commission);
    setLines(next.lines);
  }

  function draft() {
    return {
      actDate,
      reason,
      reasonText,
      basis,
      note,
      commission,
      lines: lines.map((l) => ({ id: l.id, reason: l.reason, note: l.note, qty: l.qty })),
    };
  }

  async function save() {
    setBusy(true);
    setErr("");
    setMsg("");
    const data = await send(`/api/inventory/writeoff/${sheet.id}`, "PATCH", draft());
    setBusy(false);
    if (!data?.sheet) return false;
    apply(data.sheet);
    setMsg("Сохранено");
    router.refresh();
    return true;
  }

  async function addPicked() {
    if (!picked.length) return;
    setBusy(true);
    setErr("");
    const data = await send(`/api/inventory/writeoff/${sheet.id}`, "PATCH", { ...draft(), addItemIds: picked });
    setBusy(false);
    if (!data?.sheet) return;
    apply(data.sheet);
    setPicked([]);
    setMsg("Позиции добавлены");
    router.refresh();
  }

  async function addManual() {
    const title = manualTitle.trim();
    if (!title) {
      setErr("Название строки");
      return;
    }
    setBusy(true);
    setErr("");
    const data = await send(`/api/inventory/writeoff/${sheet.id}`, "PATCH", {
      ...draft(),
      manual: { title, invNo: manualInv, qty: 1 },
    });
    setBusy(false);
    if (!data?.sheet) return;
    apply(data.sheet);
    setManualTitle("");
    setManualInv("");
    setMsg("Строка добавлена");
    router.refresh();
  }

  async function removeLine(id: string) {
    setBusy(true);
    setErr("");
    const data = await send(`/api/inventory/writeoff/${sheet.id}`, "PATCH", { ...draft(), removeLineIds: [id] });
    setBusy(false);
    if (!data?.sheet) return;
    apply(data.sheet);
    router.refresh();
  }

  async function openPdf() {
    if (open) {
      const ok = await save();
      if (!ok) return;
    }
    window.open(`/api/inventory/writeoff/${sheet.id}/pdf`, "_blank", "noopener");
  }

  async function closeSheet() {
    if (!lines.length) {
      setErr("Добавьте хотя бы одну позицию");
      return;
    }
    if (reason === "other" && !reasonText.trim()) {
      setErr("Для причины «Иное» заполните текст");
      return;
    }
    if (!commission.some((m) => m.fio.trim())) {
      setErr("Укажите хотя бы одно ФИО в комиссии");
      return;
    }
    if (!confirm(`Списать ${lines.length} позиций? Действие необратимо`)) return;
    const ok = await save();
    if (!ok) return;
    setBusy(true);
    setErr("");
    const data = await send(`/api/inventory/writeoff/${sheet.id}/close`, "POST");
    setBusy(false);
    if (!data) return;
    setSheet((s) => ({ ...s, status: "done" }));
    setMsg("Акт проведён");
    router.refresh();
  }

  async function cancelSheet() {
    if (!confirm("Отменить акт? Позиции инвентаря останутся без изменений.")) return;
    setBusy(true);
    setErr("");
    const data = await send(`/api/inventory/writeoff/${sheet.id}/cancel`, "POST");
    setBusy(false);
    if (!data) return;
    setSheet((s) => ({ ...s, status: "cancelled" }));
    setMsg("Акт отменён");
    router.refresh();
  }

  const shown = candidates.filter((it) => {
    const s = q.trim().toLocaleLowerCase("ru");
    if (!s) return true;
    return `${it.invNo} ${it.name} ${it.holder}`.toLocaleLowerCase("ru").includes(s);
  });

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted">
              {sheet.number} · автор {sheet.author}
            </p>
            <p className="mt-1 text-sm text-navy">{reasonLabel(sheet.reason, sheet.reasonText)}</p>
          </div>
          <Pill tone={st.tone}>{st.label}</Pill>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Field label="Дата акта">
            {open ? (
              <Input type="date" value={actDate} onChange={(e) => setActDate(e.target.value)} />
            ) : (
              <p>{actDate}</p>
            )}
          </Field>
          <Field label="Причина">
            {open ? (
              <Select value={reason} onChange={(e) => setReason(e.target.value)}>
                {WRITEOFF_REASONS.map((code) => (
                  <option key={code} value={code}>
                    {WRITEOFF_REASON[code]}
                  </option>
                ))}
              </Select>
            ) : (
              <p>{reasonLabel(reason, reasonText)}</p>
            )}
          </Field>
          {open && reason === "other" ? (
            <Field label="Текст причины">
              <Input value={reasonText} onChange={(e) => setReasonText(e.target.value)} />
            </Field>
          ) : null}
          <Field label="Основание">
            {open ? <Input value={basis} onChange={(e) => setBasis(e.target.value)} /> : <p>{basis || "—"}</p>}
          </Field>
          <div className="md:col-span-2">
            <Field label="Примечание">
              {open ? <Textarea value={note} onChange={(e) => setNote(e.target.value)} /> : <p>{note || "—"}</p>}
            </Field>
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="font-serif text-xl text-navy">Комиссия</h2>
        <ul className="mt-3 space-y-2">
          {commission.map((m, i) => (
            <li key={i} className="grid gap-2 md:grid-cols-[1fr_1fr]">
              {open ? (
                <>
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
                </>
              ) : (
                <p className="text-sm md:col-span-2">
                  {i === 0 ? "Председатель" : "Член"}: {[m.position, m.fio].filter(Boolean).join(", ") || "—"}
                </p>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className="font-serif text-xl text-navy">Позиции</h2>
        {lines.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Строк пока нет.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-muted">
                  <th className="py-1 pr-2">№</th>
                  <th className="py-1 pr-2">Инв. №</th>
                  <th className="py-1 pr-2">Наименование</th>
                  <th className="py-1 pr-2">Кол-во</th>
                  <th className="py-1 pr-2">Причина строки</th>
                  {open ? <th className="py-1" /> : null}
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={l.id} className="border-t border-line align-top">
                    <td className="py-2 pr-2">{i + 1}</td>
                    <td className="py-2 pr-2 font-mono text-xs">{l.invNo || "—"}</td>
                    <td className="py-2 pr-2">
                      <div className="font-semibold text-navy">{l.title}</div>
                      {open ? (
                        <Input
                          className="mt-1"
                          value={l.note}
                          placeholder="Примечание"
                          onChange={(e) => setLines((rows) => rows.map((x) => (x.id === l.id ? { ...x, note: e.target.value } : x)))}
                        />
                      ) : l.note ? (
                        <div className="text-xs text-muted">{l.note}</div>
                      ) : null}
                    </td>
                    <td className="py-2 pr-2">{l.qty}</td>
                    <td className="py-2 pr-2">
                      {open ? (
                        <Select
                          value={l.reason}
                          onChange={(e) => setLines((rows) => rows.map((x) => (x.id === l.id ? { ...x, reason: e.target.value } : x)))}
                        >
                          <option value="">Как в акте</option>
                          {WRITEOFF_REASONS.map((code) => (
                            <option key={code} value={code}>
                              {WRITEOFF_REASON[code]}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <span>{l.reason ? WRITEOFF_REASON[l.reason as keyof typeof WRITEOFF_REASON] || l.reason : "—"}</span>
                      )}
                    </td>
                    {open ? (
                      <td className="py-2">
                        <Button variant="ghost" type="button" disabled={busy} onClick={() => void removeLine(l.id)}>
                          Удалить
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {open ? (
        <Card>
          <h2 className="font-serif text-xl text-navy">Добавить позиции</h2>
          <Input className="mt-3" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск: инв. №, название, держатель" />
          {shown.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Нет свободных позиций.</p>
          ) : (
            <ul className="mt-3 max-h-64 divide-y divide-line overflow-y-auto">
              {shown.map((it) => (
                <li key={it.id}>
                  <label className="flex cursor-pointer items-start gap-3 py-2">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={picked.includes(it.id)}
                      onChange={() => setPicked((cur) => (cur.includes(it.id) ? cur.filter((x) => x !== it.id) : [...cur, it.id]))}
                    />
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
          <div className="mt-3">
            <Button type="button" variant="secondary" disabled={busy || !picked.length} onClick={() => void addPicked()}>
              Добавить выбранные
            </Button>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-[1.4fr_0.8fr_auto]">
            <Input value={manualTitle} onChange={(e) => setManualTitle(e.target.value)} placeholder="Ручная строка: наименование" />
            <Input value={manualInv} onChange={(e) => setManualInv(e.target.value)} placeholder="Инв. №" />
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void addManual()}>
              Добавить строку
            </Button>
          </div>
        </Card>
      ) : null}

      <ErrorText>{err}</ErrorText>
      <div className="flex flex-wrap gap-2">
        {open ? (
          <Button type="button" disabled={busy} onClick={() => void save()}>
            Сохранить
          </Button>
        ) : null}
        <Button type="button" variant="secondary" disabled={busy} onClick={() => void openPdf()}>
          PDF
        </Button>
        {open ? (
          <Button type="button" disabled={busy} onClick={() => void closeSheet()}>
            Закрыть (списать)
          </Button>
        ) : null}
        {open ? (
          <Button type="button" variant="danger" disabled={busy} onClick={() => void cancelSheet()}>
            Отменить
          </Button>
        ) : null}
        {msg ? <span className="self-center text-sm text-muted">{msg}</span> : null}
      </div>
    </div>
  );
}
