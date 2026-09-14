"use client";

import { useEffect, useState } from "react";
import { Button, Card } from "@/components/ui";

type Row = {
  id: string;
  name: string;
  lastUsedAt: string;
  expiresAt: string;
  current: boolean;
};

export function TrustedCard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState("");

  async function load() {
    const res = await fetch("/api/auth/trusted");
    const data = await res.json().catch(() => ({}));
    setRows(Array.isArray(data.devices) ? data.devices : []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function forget(id: string) {
    if (!confirm("На этом компьютере снова будем спрашивать код?")) return;
    const res = await fetch("/api/auth/trusted", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      setMsg("Забыли");
      void load();
    }
  }

  return (
    <Card className="max-w-lg space-y-3">
      <h2 className="font-serif text-xl text-navy">Запомненные компьютеры</h2>
      <p className="text-sm text-muted">
        Если стояла галочка «Запомнить это устройство», код на входе здесь не спрашиваем. Можно забыть.
      </p>
      {rows.length === 0 ? <p className="text-sm text-muted">Пока ни одного.</p> : null}
      <ul className="space-y-2">
        {rows.map((d) => (
          <li key={d.id} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2">
            <span>
              <span className="block font-semibold text-navy">
                {d.name || "Компьютер"}
                {d.current ? <span className="ml-2 text-xs font-normal text-gold">этот</span> : null}
              </span>
              <span className="text-xs text-muted">
                был {new Date(d.lastUsedAt).toLocaleString("ru-RU")} · до{" "}
                {new Date(d.expiresAt).toLocaleDateString("ru-RU")}
              </span>
            </span>
            <Button variant="secondary" onClick={() => void forget(d.id)}>
              Забыть
            </Button>
          </li>
        ))}
      </ul>
      {msg ? <p className="text-sm text-ok">{msg}</p> : null}
    </Card>
  );
}
