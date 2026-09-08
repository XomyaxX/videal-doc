"use client";

import { useState } from "react";
import { Button, ErrorText, Field, Input, Select, Textarea } from "@/components/ui";
import { officeYmd } from "@/lib/dates";

export function AhoPanel({
  id,
  status,
  fundStatus,
  fundAmount,
  fundDetails,
  fundPayee,
  fundNeededAt,
  fundManagerId,
  managers,
  ahoStaff,
  meId,
}: {
  id: string;
  status: string;
  fundStatus: string | null;
  fundAmount: string;
  fundDetails: string;
  fundPayee: string;
  fundNeededAt: string;
  fundManagerId: string;
  managers: { id: string; name: string }[];
  ahoStaff: { id: string; name: string }[];
  meId: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const today = officeYmd();

  async function act(action: string, extra?: Record<string, string>) {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/requests/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) setError(data.error || "Ошибка");
    else window.location.reload();
  }

  const canPrice = !fundStatus || ["draft", "rework"].includes(fundStatus);
  const defaultAho =
    ahoStaff.find((p) => p.name === fundPayee)?.id ||
    (ahoStaff.some((p) => p.id === meId) ? meId : ahoStaff[0]?.id || "");

  return (
    <div className="space-y-4">
      <ErrorText>{error}</ErrorText>
      {status === "submitted" ? (
        <Button disabled={busy} onClick={() => act("take")}>
          Взять в работу
        </Button>
      ) : null}
      {canPrice ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const payeeId = String(fd.get("payeeId") || "");
            const payeeName = ahoStaff.find((p) => p.id === payeeId)?.name || "";
            void act("save-fund", {
              amount: String(fd.get("amount") || ""),
              details: String(fd.get("details") || ""),
              payee: payeeName,
              ahoUserId: payeeId,
              neededAt: String(fd.get("neededAt") || ""),
              managerId: String(fd.get("managerId") || ""),
            });
          }}
        >
          <Field label="Сумма, ₽">
            <Input name="amount" required defaultValue={fundAmount} placeholder="0,00" inputMode="decimal" />
          </Field>
          <Field label="Нужно к дате">
            <Input name="neededAt" type="date" min={today} defaultValue={fundNeededAt} />
          </Field>
          <Field label="Получатель / кому платить" hint="Сотрудник АХО. По умолчанию — вы">
            <Select name="payeeId" defaultValue={defaultAho} required>
              {ahoStaff.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Обоснование в запросе средств">
            <Textarea name="details" defaultValue={fundDetails} />
          </Field>
          <Field label="Руководитель для согласования">
            <Select name="managerId" defaultValue={fundManagerId} required>
              <option value="">выберите</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy} variant="secondary">
              Сохранить сумму и дату
            </Button>
            <Button
              type="button"
              disabled={busy}
              onClick={(e) => {
                const form = (e.currentTarget as HTMLButtonElement).closest("form");
                if (!form) return;
                const fd = new FormData(form);
                const payeeId = String(fd.get("payeeId") || "");
                const payeeName = ahoStaff.find((p) => p.id === payeeId)?.name || "";
                void act("send-fund", {
                  amount: String(fd.get("amount") || ""),
                  details: String(fd.get("details") || ""),
                  payee: payeeName,
                  ahoUserId: payeeId,
                  neededAt: String(fd.get("neededAt") || ""),
                  managerId: String(fd.get("managerId") || ""),
                });
              }}
            >
              На согласование
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-sm text-muted">Служебная записка уже в работе ({fundStatus}).</p>
      )}
      {["submitted", "pricing", "rework"].includes(status) ? (
        <Button disabled={busy} variant="danger" onClick={() => act("rework", { note: "уточните позиции" })}>
          Вернуть сотруднику
        </Button>
      ) : null}
      {status === "paid" || fundStatus === "paid" ? (
        <Button disabled={busy} variant="gold" onClick={() => act("fulfill")}>
          Закуплено, закрыть
        </Button>
      ) : null}
    </div>
  );
}
