"use client";

import { useEffect, useState } from "react";
import { Button, Card } from "@/components/ui";

type Device = {
  id: string;
  name: string;
  platform: string;
  lastSeenAt: string;
};

export function DevicesCard() {
  const [rows, setRows] = useState<Device[]>([]);
  const [msg, setMsg] = useState("");

  async function load() {
    const res = await fetch("/api/devices");
    const data = await res.json().catch(() => ({}));
    setRows(Array.isArray(data.devices) ? data.devices : []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function revoke(id: string) {
    if (!confirm("Это устройство больше не сможет подтверждать вход?")) return;
    const res = await fetch("/api/devices", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      setMsg("Отозвано");
      void load();
    }
  }

  return (
    <Card className="max-w-lg space-y-3">
      <h2 className="font-serif text-xl text-navy">Телефоны и вход по квадрату</h2>
      <p className="text-sm text-muted">
        Войти на компьютере можно, наведя камеру на квадрат. Здесь устройства, которые уже подтверждали вход.
      </p>
      {rows.length === 0 ? <p className="text-sm text-muted">Пока ни одного. Отсканируйте квадрат на экране входа.</p> : null}
      <ul className="space-y-2">
        {rows.map((d) => (
          <li key={d.id} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2">
            <span>
              <span className="block font-semibold text-navy">{d.name || "Устройство"}</span>
              <span className="text-xs text-muted">
                {d.platform} · {new Date(d.lastSeenAt).toLocaleString("ru-RU")}
              </span>
            </span>
            <Button variant="secondary" onClick={() => void revoke(d.id)}>
              Отозвать
            </Button>
          </li>
        ))}
      </ul>
      {msg ? <p className="text-sm text-ok">{msg}</p> : null}
    </Card>
  );
}
