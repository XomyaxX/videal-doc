"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input } from "@/components/ui";

type Hit = {
  id: string;
  invNo: string;
  name: string;
  pcHost: string;
  qty: number;
  holder: string;
  userId: string | null;
};

type Line = {
  id: string;
  title: string;
  invNo: string;
  qty: number;
  action: string;
  toUserId: string;
  note: string;
};

export function ItemFinder({
  audits,
  people,
  onLine,
}: {
  audits: { id: string; label: string }[];
  people: { id: string; name: string }[];
  onLine?: (line: Line) => void;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [auditId, setAuditId] = useState(audits[0]?.id || "");
  const [toUserId, setToUserId] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    const query = q.trim();
    if (!query) return;
    setBusy("search");
    setErr("");
    const res = await fetch(`/api/inventory/search?q=${encodeURIComponent(query)}`);
    const data = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) {
      setErr(data.error || "Не удалось искать");
      return;
    }
    setHits(data.items || []);
    if (!data.items?.length) setMsg("Ничего не нашлось");
    else setMsg("");
  }

  async function reassign(itemId: string) {
    const targetAudit = audits.length === 1 ? audits[0].id : auditId;
    if (!targetAudit) {
      setErr("Откройте обход, чтобы переписать");
      return;
    }
    if (!toUserId) {
      setErr("Выберите, на кого переписать");
      return;
    }
    setBusy(itemId);
    setErr("");
    const res = await fetch(`/api/inventory/audit/${targetAudit}/reassign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inventoryItemId: itemId, toUserId }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) {
      setErr(data.error || "Не удалось переписать");
      return;
    }
    const extra = data.foundElsewhere ? " Найдено у другого, строка записана в этот обход." : "";
    const moved = data.otherAuditNumbers?.length ? ` В открытом обходе ${data.otherAuditNumbers.join(", ")} позиция помечена как переписанная.` : "";
    setMsg(`Переписано.${extra}${moved}`);
    if (data.line && (!audits.length || audits.some((row) => row.id === targetAudit))) onLine?.(data.line);
    router.refresh();
    void search();
  }

  return (
    <Card>
      <h2 className="font-semibold text-navy">Найти ТМЦ и переписать</h2>
      <p className="mt-1 text-sm text-muted">По инвентарному номеру, наименованию или имени компьютера. Ищем по всем позициям, не только по этому обходу.</p>
      <form className="mt-3 flex flex-wrap gap-2" onSubmit={(e) => void search(e)}>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Номер, название или ПК" className="max-w-sm" />
        <Button type="submit" variant="secondary" disabled={busy === "search"}>
          {busy === "search" ? "Ищем…" : "Найти"}
        </Button>
      </form>
      {audits.length > 1 ? (
        <label className="mt-3 block text-sm">
          <span className="mb-1 block font-semibold text-navy">Записать находку в обход</span>
          <select className="rounded-xl border border-line bg-card px-3 py-2 text-sm" value={auditId} onChange={(e) => setAuditId(e.target.value)}>
            {audits.map((row) => (
              <option key={row.id} value={row.id}>
                {row.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {audits.length ? (
        <label className="mt-3 block text-sm">
          <span className="mb-1 block font-semibold text-navy">Переписать на…</span>
          <select className="rounded-xl border border-line bg-card px-3 py-2 text-sm" value={toUserId} onChange={(e) => setToUserId(e.target.value)}>
            <option value="">— выберите действующего —</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="mt-3 text-sm text-muted">Чтобы переписать, откройте обход сотрудника в этом туре.</p>
      )}
      {err ? <p className="mt-2 text-sm text-bad">{err}</p> : null}
      {msg ? <p className="mt-2 text-sm text-muted">{msg}</p> : null}
      {hits.length ? (
        <ul className="mt-3 divide-y divide-line">
          {hits.map((hit) => (
            <li key={hit.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div>
                <div className="font-semibold text-navy">
                  {hit.invNo || "без номера"} · {hit.name}
                  {hit.pcHost ? ` (${hit.pcHost})` : ""}
                </div>
                <div className="text-xs text-muted">
                  сейчас: {hit.holder}
                  {hit.qty > 1 ? ` · ×${hit.qty}` : ""}
                </div>
              </div>
              {audits.length ? (
                <Button type="button" variant="secondary" disabled={Boolean(busy)} onClick={() => void reassign(hit.id)}>
                  {busy === hit.id ? "Пишем…" : "Переписать"}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
