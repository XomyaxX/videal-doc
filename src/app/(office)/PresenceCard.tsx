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
  stationBound?: boolean;
  stationMac?: string;
};

function clock(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Omsk" });
}

export function PresenceCard() {
  const [snap, setSnap] = useState<Snap | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

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

  async function pinPc() {
    setBusy(true);
    setMsg("");
    const localIps = await collectOfficeHints();
    const res = await fetch("/api/presence/pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ localIps }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error || "Не удалось закрепить ПК");
      return;
    }
    setMsg("Этот компьютер закреплён за вами");
    await load();
  }

  if (!snap || snap.leave) return null;
  if (!snap.weekdayWork && !snap.inAt) return null;

  const needIn = !snap.inAt;
  const needOut = Boolean(snap.inAt && !snap.outAt);
  const highlight = (needIn && snap.morningWindow) || (needOut && snap.eveningWindow);
  if (!needIn && !needOut && !snap.inAt) return null;

  const canMark = snap.officeConfigured && snap.onSite;
  const whyOff = !snap.officeConfigured
    ? "Админ ещё не указал офисную сеть — отметиться пока нельзя."
    : !snap.onSite
      ? "Отметить приход и уход можно только из офиса, с Wi‑Fi студии."
      : "";
  const summary = needIn
    ? "Ещё не отметили приход"
    : needOut
      ? `На работе с ${clock(snap.inAt)}`
      : `Сегодня: приход ${clock(snap.inAt)}${snap.outAt ? ` · уход ${clock(snap.outAt)}` : ""}`;

  return (
    <Card className={highlight ? "border-gold" : undefined}>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <div>
          <div className="text-sm font-semibold text-navy">Уход</div>
          <p className="text-sm text-muted">{summary}</p>
        </div>
        <span className="text-xs font-semibold text-gold">{open ? "свернуть" : "открыть"}</span>
      </button>
      {open ? (
        <div className="mt-3 border-t border-line pt-3">
          {snap.inAt ? (
            <p className="text-sm text-muted">
              Приход {clock(snap.inAt)}
              {snap.inSource === "auto" ? " · сами" : snap.inSource === "lan" ? " · по ПК в сети" : ""}
              {snap.outAt ? ` · уход ${clock(snap.outAt)}` : ""}
            </p>
          ) : null}
          {whyOff ? <p className="mt-2 text-sm text-muted">{whyOff}</p> : null}
          {msg ? (
            <p className={`mt-2 text-sm ${msg.includes("закреплён") ? "text-ok" : "text-bad"}`}>{msg}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {needIn ? (
              <Button disabled={busy || !canMark} title={whyOff || undefined} onClick={() => void act("in")}>
                {busy ? "…" : "Пришёл"}
              </Button>
            ) : null}
            {needOut ? (
              <Button disabled={busy || !canMark} title={whyOff || undefined} onClick={() => void act("out")}>
                {busy ? "…" : "Ушёл"}
              </Button>
            ) : null}
            {snap.onSite && !snap.stationBound ? (
              <Button variant="secondary" disabled={busy} onClick={() => void pinPc()}>
                {busy ? "…" : "Это мой ПК"}
              </Button>
            ) : null}
          </div>
          {snap.stationBound ? <p className="mt-2 text-xs text-muted">Рабочий ПК закреплён</p> : null}
        </div>
      ) : null}
    </Card>
  );
}
