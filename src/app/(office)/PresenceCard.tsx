"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card } from "@/components/ui";
import { collectOfficeHints } from "@/lib/lan-client";

type Snap = {
  onSite: boolean;
  officeConfigured: boolean;
  weekdayWork: boolean;
  leave: boolean;
  morningWindow: boolean;
  eveningWindow: boolean;
  inAt: string | null;
  outAt: string | null;
  inSource: string;
};

function clock(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Omsk" });
}

export function PresenceCard() {
  const [snap, setSnap] = useState<Snap | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const lan = await collectOfficeHints();
    const res = await fetch(`/api/presence?lan=${encodeURIComponent(lan.join(","))}`);
    const data = await res.json().catch(() => null);
    if (data && typeof data.onSite === "boolean") setSnap(data);
  }, []);

  useEffect(() => {
    void load();
    const onUp = () => void load();
    window.addEventListener("vd-presence", onUp);
    const t = setInterval(onUp, 60_000);
    return () => {
      window.removeEventListener("vd-presence", onUp);
      clearInterval(t);
    };
  }, [load]);

  async function act(kind: "in" | "out") {
    setBusy(true);
    setMsg("");
    const localIps = await collectOfficeHints();
    const res = await fetch(`/api/presence/${kind}`, {
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
    await load();
  }

  if (!snap || snap.leave) return null;
  if (!snap.weekdayWork && !snap.inAt) return null;

  const needIn = !snap.inAt;
  const needOut = Boolean(snap.inAt && !snap.outAt);
  const highlight = (needIn && snap.morningWindow) || (needOut && snap.eveningWindow);
  if (!needIn && !needOut && !snap.inAt) return null;

  return (
    <Card className={highlight ? "mb-6 border-gold" : "mb-6"}>
      <h2 className="font-serif text-2xl text-navy">
        {needIn ? "На работе?" : needOut ? "Уход" : "Сегодня"}
      </h2>
      {snap.inAt ? (
        <p className="mt-1 text-sm text-muted">
          Приход {clock(snap.inAt)}
          {snap.inSource === "auto" ? " · сами" : ""}
          {snap.outAt ? ` · уход ${clock(snap.outAt)}` : ""}
        </p>
      ) : null}
      {!snap.officeConfigured ? (
        <p className="mt-2 text-sm text-warn">Админ ещё не запомнил офисную сеть в Настройках — отметиться пока нельзя.</p>
      ) : !snap.onSite ? (
        <p className="mt-2 text-sm text-muted">Отметиться можно только в офисе. Подключитесь к Wi‑Fi студии.</p>
      ) : null}
      {msg ? <p className="mt-2 text-sm text-bad">{msg}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {needIn ? (
          <Button className="min-w-40" disabled={busy || !snap.onSite || !snap.officeConfigured} onClick={() => void act("in")}>
            {busy ? "…" : "Пришёл"}
          </Button>
        ) : null}
        {needOut ? (
          <Button className="min-w-40" disabled={busy || !snap.onSite} onClick={() => void act("out")}>
            {busy ? "…" : "Ушёл"}
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
