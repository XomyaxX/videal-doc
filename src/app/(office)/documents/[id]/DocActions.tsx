"use client";

import { useState } from "react";
import { Button, ErrorText, Field, Textarea } from "@/components/ui";

export function DocActions({
  id,
  fileId,
  requireAck,
  requireSignedReturn,
  requireApproval,
  isApprover,
  viewed: viewedStart,
  acked,
  signed,
  approved,
  rejected,
}: {
  id: string;
  fileId: string;
  requireAck: boolean;
  requireSignedReturn: boolean;
  requireApproval: boolean;
  isApprover: boolean;
  viewed: boolean;
  acked: boolean;
  signed: boolean;
  approved: boolean;
  rejected: boolean;
}) {
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [viewed, setViewed] = useState(viewedStart);
  if (rejected) return <p className="text-bad">Вы отметили, что не можете выполнить этот документ.</p>;

  async function markViewed() {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/documents/${id}/view`, { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось открыть");
      return;
    }
    setViewed(true);
    document.getElementById("doc-viewer")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function ack() {
    setBusy(true);
    const res = await fetch(`/api/documents/${id}/ack`, { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) setError(data.error);
    else window.location.reload();
  }

  async function sign(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch(`/api/documents/${id}/sign`, { method: "POST", body: new FormData(e.currentTarget) });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) setError(data.error);
    else window.location.reload();
  }

  async function approve() {
    setBusy(true);
    const res = await fetch(`/api/documents/${id}/approve`, { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) setError(data.error);
    else window.location.reload();
  }

  async function reject() {
    if (reason.trim().length < 3) {
      setError("Напишите, почему не можете выполнить");
      return;
    }
    if (!confirm("Отметить, что вы не можете выполнить этот документ?")) return;
    setBusy(true);
    const res = await fetch(`/api/documents/${id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) setError(data.error);
    else window.location.reload();
  }

  const needAck = requireAck && !acked;
  const needSign = requireSignedReturn && !signed;
  const needApprove = requireApproval && isApprover && !approved;
  const needAction = needAck || needSign || needApprove;
  const hint = viewed
    ? "Документ открыт. Можно подтвердить."
    : "Сначала нажмите «Открыть документ» — без просмотра подтверждение не ставится.";

  const actions = (
    <>
      <ErrorText>{error}</ErrorText>
      {needAction && !viewed ? (
        <div className="rounded-xl bg-paper p-3">
          <p className="mb-2 text-sm text-muted">{hint}</p>
          <Button onClick={() => void markViewed()} disabled={busy}>
            Открыть документ
          </Button>
        </div>
      ) : null}
      {needAck ? (
        <div>
          <p className="mb-2 text-sm text-muted">
            {viewed
              ? "Документ открыт. Можно подтвердить ознакомление."
              : "На широком экране документ в окне слева. На телефоне нажмите «Открыть документ»."}
          </p>
          <Button onClick={ack} disabled={!viewed || busy} title={!viewed ? hint : undefined}>
            Я ознакомился
          </Button>
        </div>
      ) : null}
      {requireAck && acked ? <p className="font-semibold text-ok">Ознакомление зафиксировано.</p> : null}

      {needSign ? (
        <form onSubmit={sign} className="space-y-2 rounded-xl bg-paper p-4">
          <p className="font-semibold text-navy">Распечатайте, подпишите, загрузите скан</p>
          <Field label="Подписанный файл">
            <input name="file" type="file" required className="block w-full" />
          </Field>
          <Button type="submit" variant="gold" disabled={busy}>
            Отправить подписанный
          </Button>
        </form>
      ) : null}
      {requireSignedReturn && signed ? <p className="font-semibold text-ok">Подписанный скан получен.</p> : null}

      {needApprove ? (
        <div>
          <p className="mb-2 text-sm text-muted">
            {viewed ? "Документ открыт. Можно согласовать." : hint}
          </p>
          <Button onClick={approve} disabled={!viewed || busy} variant="gold" title={!viewed ? hint : undefined}>
            Согласовать
          </Button>
        </div>
      ) : null}
      {requireApproval && isApprover && approved ? <p className="font-semibold text-ok">Согласование зафиксировано.</p> : null}

      {needAction ? (
        <div className="border-t border-line pt-3">
          <Field label="Если не можете выполнить — напишите почему">
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} required />
          </Field>
          <Button type="button" variant="danger" className="mt-2" onClick={() => void reject()} disabled={busy}>
            Не могу выполнить
          </Button>
        </div>
      ) : null}
    </>
  );

  return (
    <div className="space-y-4">
      <div className="space-y-4 pb-24 md:pb-0">{actions}</div>
      {needAction ? (
        <div className="fixed inset-x-0 z-30 border-t border-line bg-card px-3 py-2 md:hidden bottom-[calc(3.5rem+env(safe-area-inset-bottom))]">
          <div className="flex flex-wrap gap-2">
            {needAck ? (
              <Button className="flex-1" onClick={ack} disabled={!viewed || busy}>
                Я ознакомился
              </Button>
            ) : null}
            {needApprove ? (
              <Button className="flex-1" variant="gold" onClick={approve} disabled={!viewed || busy}>
                Согласовать
              </Button>
            ) : null}
            <Button href={`/api/files/${fileId}`} variant="secondary">
              Скачать
            </Button>
            <Button type="button" variant="ghost" onClick={() => void reject()} disabled={busy}>
              Не могу выполнить
            </Button>
          </div>
          {!viewed ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
