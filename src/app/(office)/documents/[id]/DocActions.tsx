"use client";

import { useState } from "react";
import { Button, ErrorText, Field, Textarea } from "@/components/ui";

export function DocActions({
  id,
  requireAck,
  requireSignedReturn,
  requireApproval,
  isApprover,
  viewed,
  acked,
  signed,
  approved,
  rejected,
}: {
  id: string;
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
  if (rejected) return <p className="text-bad">Вы отказались от этого документа.</p>;

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

  return (
    <div className="space-y-4">
      <ErrorText>{error}</ErrorText>
      {requireAck && !acked ? (
        <div>
          <p className="mb-2 text-sm text-muted">
            {viewed ? "Файл открыт. Можно подтвердить ознакомление." : "Сначала откройте файл справа — без этого галочка не ставится."}
          </p>
          <Button onClick={ack} disabled={!viewed || busy}>
            Я ознакомился
          </Button>
        </div>
      ) : null}
      {requireAck && acked ? <p className="font-semibold text-ok">Ознакомление зафиксировано.</p> : null}

      {requireSignedReturn && !signed ? (
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

      {requireApproval && isApprover && !approved ? (
        <div>
          <p className="mb-2 text-sm text-muted">
            {viewed ? "Файл открыт. Можно согласовать документ." : "Сначала откройте файл справа — без этого согласование не ставится."}
          </p>
          <Button onClick={approve} disabled={!viewed || busy} variant="gold">
            Согласовать
          </Button>
        </div>
      ) : null}
      {requireApproval && isApprover && approved ? <p className="font-semibold text-ok">Согласование зафиксировано.</p> : null}

      {(requireAck && !acked) || (requireSignedReturn && !signed) || (requireApproval && isApprover && !approved) ? (
        <div className="border-t border-line pt-3">
          <Field label="Если не можете выполнить — напишите почему">
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <Button type="button" variant="danger" className="mt-2" onClick={reject} disabled={busy}>
            Отказаться
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function MarkViewed({ id }: { id: string }) {
  return (
    <iframe
      title="Документ"
      src={`/api/files/${id}`}
      className="h-[70vh] w-full rounded-xl border border-line bg-white"
      onLoad={() => {
        const docId = document.documentElement.getAttribute("data-doc-id");
        if (docId) fetch(`/api/documents/${docId}/view`, { method: "POST" });
      }}
    />
  );
}
