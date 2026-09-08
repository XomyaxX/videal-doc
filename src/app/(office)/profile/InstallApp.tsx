"use client";

import { useEffect, useState } from "react";
import { Button, Card } from "@/components/ui";
import { enablePush } from "@/components/PushSubscribe";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export function InstallApp() {
  const [promptEvent, setPromptEvent] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState("");

  useEffect(() => {
    const nav = navigator as Navigator & { standalone?: boolean };
    const standalone = window.matchMedia("(display-mode: standalone)").matches || Boolean(nav.standalone);
    if (standalone) setInstalled(true);
    setIos(/iPhone|iPad|iPod/i.test(navigator.userAgent) && !("MSStream" in window));
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", () => {
      setInstalled(true);
      setPromptEvent(null);
    });
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  async function install() {
    if (promptEvent) {
      setBusy(true);
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      setBusy(false);
      if (choice.outcome === "accepted") setInstalled(true);
      setPromptEvent(null);
      const push = await enablePush();
      setHint(push === "ok" ? "Пуш включён. Можно проверить в админке → Настройки." : push);
      return;
    }
    const push = await enablePush();
    if (push === "ok") {
      setHint("Пуш включён. На iPhone баннер приходит, только если иконка на экране «Домой» (Поделиться → На экран «Домой»).");
      return;
    }
    if (ios) {
      setHint("На iPhone: Поделиться → На экран «Домой», откройте иконку, нажмите «Загрузить» ещё раз и разрешите уведомления.");
      return;
    }
    setHint(push);
  }

  return (
    <Card className="max-w-lg space-y-3">
      <h2 className="font-serif text-xl text-navy">Приложение на телефон</h2>
      <p className="text-sm text-muted">
        Поставьте Видеал.Док на экран телефона. Ставится один раз, дальше открывается как приложение и само подтягивает
        обновления сайта.
      </p>
      {installed ? (
        <p className="text-sm text-ok">Уже стоит на этом устройстве.</p>
      ) : null}
      <Button className="w-full" disabled={busy} onClick={() => void install()}>
        {busy ? "…" : installed ? "Включить уведомления" : "Загрузить"}
      </Button>
      {hint ? <p className="text-sm text-muted">{hint}</p> : null}
    </Card>
  );
}
