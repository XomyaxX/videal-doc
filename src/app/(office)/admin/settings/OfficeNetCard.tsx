"use client";

import { useEffect, useState } from "react";
import { Button, Card } from "@/components/ui";
import { collectOfficeHints } from "@/lib/lan-client";

export function OfficeNetCard() {
  const [cidrs, setCidrs] = useState<string[]>([]);
  const [ip, setIp] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch("/api/admin/office-net");
    const data = await res.json().catch(() => ({}));
    setCidrs(Array.isArray(data.cidrs) ? data.cidrs : []);
    setIp(data.currentIp || "");
  }

  useEffect(() => {
    void load();
  }, []);

  async function remember() {
    setBusy(true);
    setMsg("");
    const localIps = await collectOfficeHints();
    const res = await fetch("/api/admin/office-net", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ localIps }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error || "Не удалось");
      return;
    }
    setCidrs(data.cidrs || []);
    const lan = (data.cidrs || []).filter((c: string) => c.includes("/")).join(", ");
    setMsg(
      lan
        ? `Запомнили локальную сеть ${lan}. Сотрудники в этом Wi‑Fi смогут отмечаться.`
        : "Запомнили внешний IP. Нажмите ещё раз с компьютера в Chrome в офисе, чтобы поймать 192.168.x.",
    );
    void load();
  }

  async function drop(addr: string) {
    await fetch("/api/admin/office-net", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ip: addr }),
    });
    void load();
  }

  return (
    <Card className="mb-6 max-w-lg space-y-3">
      <h2 className="font-serif text-xl text-navy">Сеть офиса</h2>
      <p className="text-sm text-muted">
        Нажмите кнопку с компьютера в офисе. Запомнится локальная сеть (например 192.168.1.0/24), а не только интернет-IP
        {ip ? ` (сейчас снаружи ${ip})` : ""}.
      </p>
      <Button type="button" disabled={busy} onClick={() => void remember()}>
        {busy ? "…" : "Я сейчас в офисе — запомнить эту сеть"}
      </Button>
      {cidrs.length ? (
        <ul className="text-sm">
          {cidrs.map((c) => (
            <li key={c} className="flex items-center justify-between gap-2 border-t border-line py-1">
              <span className="font-mono">{c}</span>
              <Button variant="ghost" onClick={() => void drop(c)}>
                Убрать
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-warn">Пока сеть не задана — никто не отметится.</p>
      )}
      {msg ? <p className="text-sm text-ok">{msg}</p> : null}
    </Card>
  );
}
