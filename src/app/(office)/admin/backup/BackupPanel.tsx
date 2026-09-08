"use client";

import { useEffect, useState } from "react";
import { Button, Card, ErrorText } from "@/components/ui";

type Row = { name: string; size: number; at: string };

export function BackupPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    const res = await fetch("/api/admin/backup");
    const data = await res.json().catch(() => ({}));
    setRows(data.rows || []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function make() {
    setBusy(true);
    setError("");
    setMsg("");
    const res = await fetch("/api/admin/backup", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Не удалось");
      return;
    }
    setMsg(`Снято: ${data.name}`);
    await load();
  }

  return (
    <Card className="max-w-lg space-y-3">
      <ErrorText>{error}</ErrorText>
      {msg ? <p className="text-sm text-ok">{msg}</p> : null}
      <Button type="button" disabled={busy} onClick={make}>
        {busy ? "Снимаем…" : "Снять копию базы сейчас"}
      </Button>
      <p className="text-sm text-muted">Копия базы и папки чатов: data/backups/дата_время/ на сервере.</p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">Пока нет копий.</p>
      ) : (
        <ul className="divide-y divide-line text-sm">
          {rows.map((r) => (
            <li key={r.name} className="flex justify-between gap-2 py-2">
              <span className="font-mono">{r.name}</span>
              <span className="text-muted">{Math.round(r.size / 1024)} КБ</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
