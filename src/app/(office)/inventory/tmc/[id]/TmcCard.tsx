"use client";

import { useState } from "react";
import { Button, Card, Input } from "@/components/ui";
import type { TmcMember } from "@/lib/tmc";

export function TmcCard({
  manage,
  sheet,
}: {
  manage: boolean;
  sheet: {
    id: string;
    number: string;
    employee: string;
    position: string;
    workplace: string;
    lines: { title: string; invNo: string; qty: number }[];
    commission: TmcMember[];
  };
}) {
  const [commission, setCommission] = useState(sheet.commission);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function save() {
    setBusy(true);
    setMsg("");
    const res = await fetch(`/api/inventory/tmc/${sheet.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commission }),
    });
    setBusy(false);
    setMsg(res.ok ? "Сохранено" : "Не удалось сохранить");
  }

  return (
    <div className="space-y-4">
      <Card>
        <dl className="grid gap-2 text-sm md:grid-cols-2">
          <div>
            <dt className="text-xs uppercase text-muted">МОЛ</dt>
            <dd className="font-semibold text-navy">{sheet.employee}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-muted">Должность</dt>
            <dd>{sheet.position || "—"}</dd>
          </div>
          <div className="md:col-span-2">
            <dt className="text-xs uppercase text-muted">Подразделение</dt>
            <dd>{sheet.workplace || "—"}</dd>
          </div>
        </dl>
      </Card>
      <Card>
        <h2 className="font-serif text-xl text-navy">ТМЦ</h2>
        {sheet.lines.length === 0 ? (
          <p className="mt-2 text-sm text-muted">За сотрудником ничего не закреплено.</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-muted">
                <th className="py-1 pr-2">№</th>
                <th className="py-1 pr-2">Наименование</th>
                <th className="py-1 pr-2">Инв. №</th>
                <th className="py-1">Кол-во</th>
              </tr>
            </thead>
            <tbody>
              {sheet.lines.map((l, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="py-1.5 pr-2">{i + 1}</td>
                  <td className="py-1.5 pr-2">{l.title}</td>
                  <td className="py-1.5 pr-2 font-mono text-xs">{l.invNo || "—"}</td>
                  <td className="py-1.5">{l.qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <Card>
        <h2 className="font-serif text-xl text-navy">Члены комиссии</h2>
        <ul className="mt-3 space-y-2">
          {commission.map((m, i) => (
            <li key={i} className="grid gap-2 md:grid-cols-[1.2fr_1fr]">
              {manage ? (
                <>
                  <Input value={m.role} onChange={(e) => setCommission((c) => c.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)))} />
                  <Input value={m.name} onChange={(e) => setCommission((c) => c.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                </>
              ) : (
                <p className="text-sm">
                  {m.role} {m.name}
                </p>
              )}
            </li>
          ))}
        </ul>
      </Card>
      <div className="flex flex-wrap gap-2">
        {manage ? (
          <Button type="button" onClick={() => void save()} disabled={busy}>
            Сохранить комиссию
          </Button>
        ) : null}
        <Button href={`/api/inventory/tmc/${sheet.id}/pdf`} variant="secondary">
          Печать PDF
        </Button>
        {msg ? <span className="self-center text-sm text-muted">{msg}</span> : null}
      </div>
    </div>
  );
}
