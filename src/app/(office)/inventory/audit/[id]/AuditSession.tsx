"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button, Card, Input } from "@/components/ui";

type Line = {
  id: string;
  title: string;
  invNo: string;
  qty: number;
  action: string;
  toUserId: string;
  note: string;
};

export function AuditSession({
  sheetId,
  lines: initial,
  people,
  closed,
}: {
  sheetId: string;
  lines: Line[];
  people: { id: string; name: string }[];
  closed: boolean;
}) {
  const router = useRouter();
  const [lines, setLines] = useState(initial);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  const pending = useMemo(() => lines.filter((l) => !l.action).length, [lines]);

  async function setAction(line: Line, action: string, extra?: { toUserId?: string; note?: string }) {
    if (closed) return;
    const toUserId = extra?.toUserId ?? line.toUserId;
    const note = extra?.note ?? line.note;
    if (action === "transfer" && !toUserId) {
      setMsg("Выберите, кому передать");
      return;
    }
    setBusy(line.id);
    setMsg("");
    const res = await fetch(`/api/inventory/audit/${sheetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lineId: line.id, action, toUserId, note }),
    });
    setBusy("");
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setMsg(data.error || "Не удалось сохранить");
      return;
    }
    setLines((prev) => prev.map((l) => (l.id === line.id ? { ...l, action, toUserId, note } : l)));
  }

  async function finish(questionRest: boolean) {
    if (closed) return;
    setBusy("finish");
    const res = await fetch(`/api/inventory/audit/${sheetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ finish: true, questionRest }),
    });
    setBusy("");
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setMsg(data.error || "Не удалось закрыть");
      return;
    }
    router.push("/inventory");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        {closed
          ? "Обход закрыт."
          : `Отметьте каждую позицию. Не найденные уйдут в блок «На обработке» на странице инвентаря. Осталось ${pending}.`}
      </p>
      {msg ? <p className="text-sm text-bad">{msg}</p> : null}
      {lines.map((l) => (
        <Card key={l.id} className={l.action === "question" ? "border-gold" : ""}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="font-semibold text-navy">{l.title}</div>
              <div className="text-xs text-muted">
                {l.invNo ? `инв. ${l.invNo}` : "без номера"}
                {l.qty > 1 ? ` · ×${l.qty}` : ""}
              </div>
            </div>
            {l.action === "found" ? <span className="text-sm font-semibold text-ok">на месте</span> : null}
            {l.action === "transfer" ? <span className="text-sm font-semibold text-gold">передан</span> : null}
            {l.action === "question" ? <span className="text-sm font-semibold text-bad">под вопросом</span> : null}
          </div>
          {closed ? null : (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button type="button" variant={l.action === "found" ? "primary" : "secondary"} disabled={busy === l.id} onClick={() => void setAction(l, "found")}>
                На месте
              </Button>
              <select
                className="rounded-xl border border-line bg-white px-3 py-2 text-sm"
                value={l.toUserId}
                disabled={busy === l.id}
                onChange={(e) => {
                  const toUserId = e.target.value;
                  setLines((prev) => prev.map((x) => (x.id === l.id ? { ...x, toUserId } : x)));
                  if (toUserId) void setAction({ ...l, toUserId }, "transfer", { toUserId });
                }}
              >
                <option value="">Передать…</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <Button type="button" variant={l.action === "question" ? "primary" : "ghost"} disabled={busy === l.id} onClick={() => void setAction(l, "question")}>
                Не найден
              </Button>
            </div>
          )}
          {l.action === "question" || (!closed && l.action !== "found" && l.action !== "transfer") ? (
            <div className="mt-2">
              <Input
                placeholder="Комментарий (необязательно)"
                value={l.note}
                disabled={closed || busy === l.id}
                onChange={(e) => setLines((prev) => prev.map((x) => (x.id === l.id ? { ...x, note: e.target.value } : x)))}
                onBlur={() => {
                  if (!closed && l.action === "question") void setAction(l, "question", { note: l.note });
                }}
              />
            </div>
          ) : null}
        </Card>
      ))}
      {closed ? null : (
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={Boolean(busy)} onClick={() => void finish(false)}>
            Завершить обход
          </Button>
          {pending > 0 ? (
            <Button type="button" variant="secondary" disabled={Boolean(busy)} onClick={() => void finish(true)}>
              Остальные — под вопрос и закрыть
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
