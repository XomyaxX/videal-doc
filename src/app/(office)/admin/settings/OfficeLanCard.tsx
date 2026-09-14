"use client";

import { useEffect, useState } from "react";
import { Button, Card, Input, Select } from "@/components/ui";

type Person = { id: string; name: string };
type Station = {
  id: string;
  userId: string;
  mac: string;
  ipv4: string;
  label: string;
  lastSeenAt: string | null;
  online: boolean;
  userName: string;
};
type Host = { ip: string; mac: string; stationId: string; userId: string; userName: string };

export function OfficeLanCard({ people }: { people: Person[] }) {
  const [stations, setStations] = useState<Station[]>([]);
  const [hosts, setHosts] = useState<Host[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [label, setLabel] = useState<Record<string, string>>({});

  async function load() {
    const res = await fetch("/api/admin/office-lan");
    const data = await res.json().catch(() => ({}));
    setStations(Array.isArray(data.stations) ? data.stations : []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function scan() {
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/admin/office-lan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "scan" }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error || "Скан не удался — сервер должен быть в офисной сети");
      return;
    }
    setHosts(Array.isArray(data.hosts) ? data.hosts : []);
    setStations(Array.isArray(data.stations) ? data.stations : []);
    setMsg(`Нашли ${Array.isArray(data.hosts) ? data.hosts.length : 0} устройств в ARP`);
  }

  async function bind(h: Host) {
    const userId = pick[h.mac] || h.userId;
    if (!userId) {
      setMsg("Выберите сотрудника");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/admin/office-lan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "bind", mac: h.mac, userId, ipv4: h.ip, label: label[h.mac] || "ПК" }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error || "Не удалось привязать");
      return;
    }
    setMsg("Привязали");
    void scan();
  }

  async function bindAll() {
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/admin/office-lan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "bind-all" }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error || "Не удалось назначить");
      return;
    }
    if (Array.isArray(data.stations)) setStations(data.stations);
    setMsg(
      data.bound
        ? `Закрепили ${data.bound} ПК за учётками` + (data.skipped ? `, пропустили ${data.skipped}` : "")
        : "Никого не вышло: люди должны быть в Доке с офисного Wi‑Fi (лучше http://192.168.1.51). Потом нажмите ещё раз.",
    );
  }

  async function drop(id: string) {
    if (!confirm("Отвязать этот ПК?")) return;
    await fetch("/api/admin/office-lan", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    void load();
  }

  return (
    <Card className="mb-6 max-w-3xl space-y-3">
      <h2 className="font-serif text-xl text-navy">ПК в офисной сети</h2>
      <p className="text-sm text-muted">
        Сервер сам опрашивает локалку (ping + ARP). Привяжите MAC рабочего компьютера к сотруднику — приход отметится, когда
        этот ПК появится в сети. Уход по-прежнему кнопкой: компьютер часто остаётся включённым.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={busy} onClick={() => void scan()}>
          {busy ? "Сканируем сеть…" : "Сканировать сейчас"}
        </Button>
        <Button
          type="button"
          variant="gold"
          disabled={busy}
          onClick={() => void bindAll()}
        >
          Назначить всех по учёткам
        </Button>
      </div>
      {msg ? <p className="text-sm text-ok">{msg}</p> : null}

      {hosts.length > 0 ? (
        <div className="overflow-x-auto">
          <p className="mb-2 text-sm font-semibold text-navy">Сейчас в сети</p>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-muted">
                <th className="py-1 pr-2">IP</th>
                <th className="py-1 pr-2">MAC</th>
                <th className="py-1 pr-2">Сотрудник</th>
                <th className="py-1"> </th>
              </tr>
            </thead>
            <tbody>
              {hosts.map((h) => (
                <tr key={h.mac + h.ip} className="border-t border-line">
                  <td className="py-2 pr-2 font-mono text-xs">{h.ip}</td>
                  <td className="py-2 pr-2 font-mono text-xs">{h.mac}</td>
                  <td className="py-2 pr-2">
                    {h.userName ? (
                      <span>{h.userName}</span>
                    ) : (
                      <div className="flex flex-col gap-1 sm:flex-row">
                        <Select value={pick[h.mac] || ""} onChange={(e) => setPick((s) => ({ ...s, [h.mac]: e.target.value }))}>
                          <option value="">— кто это —</option>
                          {people.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </Select>
                        <Input
                          placeholder="ПК / ноут"
                          value={label[h.mac] || ""}
                          onChange={(e) => setLabel((s) => ({ ...s, [h.mac]: e.target.value }))}
                        />
                      </div>
                    )}
                  </td>
                  <td className="py-2">
                    {h.userName ? null : (
                      <Button variant="secondary" disabled={busy} onClick={() => void bind(h)}>
                        Привязать
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted">Нажмите «Сканировать», когда вы в офисе. Пустой список — сервер не видит ARP (не та сеть или нет ping).</p>
      )}

      {stations.length > 0 ? (
        <div>
          <p className="mb-2 text-sm font-semibold text-navy">Привязанные ПК</p>
          <ul className="divide-y divide-line text-sm">
            {stations.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <span className="font-semibold">{s.userName}</span>
                  <span className="ml-2 text-muted">
                    {s.label || "ПК"} · {s.mac}
                    {s.ipv4 ? ` · ${s.ipv4}` : ""}
                    {s.online ? " · в сети" : " · не видно"}
                  </span>
                </span>
                <Button variant="ghost" onClick={() => void drop(s.id)}>
                  Отвязать
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}
