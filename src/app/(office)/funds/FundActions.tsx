"use client";

import { useState } from "react";
import { Button, ErrorText, Field, Input, Select, Textarea } from "@/components/ui";
import { SearchSelect, type SearchOption } from "@/components/SearchSelect";
import { officeYmd } from "@/lib/dates";

export function FundActions({
  id,
  status,
  isAuthor,
  isManager,
  isAccountant,
  purpose,
  amount,
  details,
  payee,
  neededAt,
  managerId,
  managers,
  payees,
  advanceReportId,
}: {
  id: string;
  status: string;
  isAuthor: boolean;
  isManager: boolean;
  isAccountant: boolean;
  purpose: string;
  amount: string;
  details: string;
  payee: string;
  neededAt: string;
  managerId: string;
  managers: { id: string; name: string }[];
  payees: SearchOption[];
  advanceReportId?: string | null;
}) {
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const canEdit = isAuthor && ["draft", "rework"].includes(status);
  const today = officeYmd();
  const payeeOptions =
    payee && !payees.some((p) => p.label === payee) ? [{ id: "__saved", label: payee }, ...payees] : payees;
  const payeeId = payeeOptions.find((p) => p.label === payee)?.id || "";
  const neededMin = neededAt && neededAt < today ? neededAt : today;

  async function act(action: string, extra?: Record<string, string>) {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/funds/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, note, ...extra }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) setError(data.error || "Ошибка");
    else window.location.reload();
  }

  return (
    <div className="space-y-4">
      <ErrorText>{error}</ErrorText>
      {canEdit ? (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            await act("save", {
              purpose: String(fd.get("purpose") || ""),
              amount: String(fd.get("amount") || ""),
              details: String(fd.get("details") || ""),
              payee: String(fd.get("payee") || ""),
              neededAt: String(fd.get("neededAt") || ""),
              managerId: String(fd.get("managerId") || ""),
            });
          }}
        >
          <Field label="Назначение">
            <Input name="purpose" defaultValue={purpose} />
          </Field>
          <Field label="Сумма, ₽">
            <Input name="amount" defaultValue={amount} />
          </Field>
          <Field label="Получатель">
            <SearchSelect name="payee" options={payeeOptions} defaultId={payeeId} required />
          </Field>
          <Field label="Нужны к дате">
            <Input name="neededAt" type="date" min={neededMin} defaultValue={neededAt} />
          </Field>
          <Field label="Обоснование">
            <Textarea name="details" defaultValue={details} />
          </Field>
          <Field label="Руководитель">
            <Select name="managerId" defaultValue={managerId}>
              <option value="">Выберите</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" variant="secondary" disabled={busy}>
            Сохранить
          </Button>
        </form>
      ) : (
        <div className="space-y-1 text-sm">
          {details ? <p>{details}</p> : null}
          {payee ? <p className="text-muted">Получатель: {payee}</p> : null}
        </div>
      )}

      <Button href={`/api/funds/${id}/pdf`} variant="gold">
        Скачать / печать PDF
      </Button>

      {status === "paid" && isAuthor && !advanceReportId ? (
        <Button href={`/advances/new?funds=${id}`} className="w-full">
          Отчитаться (авансовый отчёт)
        </Button>
      ) : null}
      {advanceReportId ? (
        <Button href={`/advances/${advanceReportId}`} variant="secondary" className="w-full">
          Открыть авансовый отчёт
        </Button>
      ) : null}

      {canEdit ? (
        <Button className="w-full" disabled={busy} onClick={() => act("submit")}>
          Отправить руководителю
        </Button>
      ) : null}

      {isManager && status === "review" ? (
        <div className="space-y-2 rounded-xl bg-paper p-3">
          <p className="font-semibold text-navy">Согласование руководителя</p>
          <Field label="Комментарий">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => act("approve")}>
              Согласовать, в бухгалтерию
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => act("rework")}>
              На доработку
            </Button>
            <Button variant="danger" disabled={busy} onClick={() => act("reject")}>
              Отклонить
            </Button>
          </div>
        </div>
      ) : null}

      {isAccountant && status === "to_pay" ? (
        <div className="space-y-2 rounded-xl bg-paper p-3">
          <p className="font-semibold text-navy">Бухгалтерия: выплата</p>
          <Field label="Комментарий">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => act("paid")}>
              Выплачено, взято в оборот
            </Button>
            <Button variant="danger" disabled={busy} onClick={() => act("acc-reject")}>
              Отклонить
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
