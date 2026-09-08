"use client";

import { useEffect, useState } from "react";
import { Button, Card, ErrorText, Input } from "@/components/ui";

export function ChatKeyCard() {
  const [hasBackup, setHasBackup] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [restore, setRestore] = useState("");
  const [wrote, setWrote] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch("/api/admin/chat-key");
    const data = await res.json().catch(() => ({}));
    if (res.ok) setHasBackup(Boolean(data.hasBackup));
  }

  useEffect(() => {
    void load();
  }, []);

  async function backup() {
    if (busy) return;
    if (hasBackup && !confirm("Старая фраза перестанет открывать ключ. Сделать новую?")) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/admin/chat-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "backup" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Не вышло");
      setPhrase(data.phrase);
      setHasBackup(true);
      setWrote(false);
      setMsg("Запишите 12 слов и спрячьте. Сотрудникам они не нужны и не показываются.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    }
    setBusy(false);
  }

  async function doRestore() {
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/admin/chat-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore", phrase: restore }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Не вышло");
      setMsg("Ключ восстановлен. Чаты снова читаются.");
      setRestore("");
      void load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    }
    setBusy(false);
  }

  return (
    <Card className="mb-6 max-w-lg space-y-3">
      <h2 className="font-serif text-xl text-navy">Ключ чатов</h2>
      <p className="text-sm text-muted">
        Переписка на диске зашифрована. Ключ только у админа. Сотрудники пишут как обычно — 12 слов им не показывают.
        Без фразы после смены серверного секрета старые сообщения не откроются.
      </p>
      {hasBackup ? (
        <p className="text-sm">Фраза восстановления уже создавалась.</p>
      ) : (
        <p className="rounded-xl bg-[var(--bad-bg)] px-3 py-2 text-sm text-bad">
          Фразы ещё нет. Запишите её, иначе после смены сервера чаты не откроются.
        </p>
      )}
      {phrase ? (
        <div className="rounded-xl bg-paper p-3">
          <p className="text-xs font-semibold uppercase text-muted">Запишите и спрячьте</p>
          <p className="mt-1 font-mono text-sm leading-relaxed text-navy">{phrase}</p>
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={wrote} onChange={(e) => setWrote(e.target.checked)} />
            Записал(а)
          </label>
        </div>
      ) : null}
      <Button type="button" disabled={busy} onClick={() => void backup()}>
        {hasBackup ? "Новая фраза" : "Создать фразу восстановления"}
      </Button>
      <div className="space-y-2">
        <p className="text-sm font-semibold text-navy">Восстановить ключ</p>
        <Input value={restore} onChange={(e) => setRestore(e.target.value)} placeholder="12 слов" />
        <Button type="button" variant="secondary" disabled={busy || !restore.trim()} onClick={() => void doRestore()}>
          Восстановить
        </Button>
      </div>
      <ErrorText>{err}</ErrorText>
      {msg ? <p className="text-sm text-ok">{msg}</p> : null}
    </Card>
  );
}
