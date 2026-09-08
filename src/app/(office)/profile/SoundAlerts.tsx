"use client";

import { useState } from "react";
import { Button, Card } from "@/components/ui";
import { fireLocalAlert } from "@/components/notify-alert";
import { enablePush } from "@/components/PushSubscribe";
import type { Urgency } from "@/lib/notify-urgency";

export function SoundAlerts({ enabled }: { enabled: boolean }) {
  const [on, setOn] = useState(enabled);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(next: boolean) {
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/profile/sounds", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ soundAlerts: next }),
    });
    setBusy(false);
    if (!res.ok) {
      setMsg("Не удалось сохранить");
      return;
    }
    setOn(next);
    try {
      localStorage.setItem("vd-sound-alerts", next ? "1" : "0");
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new Event("vd-sound-alerts"));
    setMsg(next ? "Звук включён" : "Звук выключен");
  }

  async function test(level: Urgency) {
    setMsg("");
    if (typeof Notification !== "undefined") {
      let perm: NotificationPermission = Notification.permission;
      if (perm !== "granted") {
        const push = await enablePush();
        perm = Notification.permission;
        if (perm !== "granted") {
          setMsg(push);
          return;
        }
      }
    }
    const out = await fireLocalAlert({
      title: level === "urgent" ? "Срочно — Видеал.Док" : "Проверка уведомления",
      body:
        level === "urgent"
          ? "Так звучит срочное: канал уведомлений и вибрация на Android."
          : level === "normal"
            ? "Обычное уведомление, не медиа."
            : "Справка: короткий сигнал.",
      link: "/profile",
      urgency: level,
      test: true,
    });
    if (out.ok) {
      setMsg(
        level === "urgent"
          ? "Карточка уведомления + вибрация (Android). Громкость — ползунок уведомлений."
          : "Карточка ушла в канал уведомлений, не в медиа.",
      );
      return;
    }
    setMsg(out.reason);
  }

  return (
    <Card className="space-y-3">
      <h2 className="font-serif text-xl text-navy">Звуки и вибрация</h2>
      <p className="text-sm text-muted">
        На телефоне звук идёт из <strong>уведомлений</strong>, не из медиа. Нужно разрешить уведомления (на iPhone — ещё
        «На экран Домой»). Громкость — ползунок уведомлений. Свой рингтон браузер не даёт, свой рисунок вибрации на
        iPhone тоже нет.
      </p>
      <label className="flex items-center gap-3 text-sm font-semibold text-navy">
        <input
          type="checkbox"
          className="h-4 w-4 accent-navy"
          checked={on}
          disabled={busy}
          onChange={(e) => void save(e.target.checked)}
        />
        Сигнал при новых событиях
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={() => void test("info")}>
          Справка
        </Button>
        <Button type="button" variant="secondary" onClick={() => void test("normal")}>
          Обычное
        </Button>
        <Button type="button" variant="gold" onClick={() => void test("urgent")}>
          Срочно
        </Button>
      </div>
      {msg ? <p className="text-sm text-navy">{msg}</p> : null}
    </Card>
  );
}
