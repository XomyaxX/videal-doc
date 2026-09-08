"use client";

import { useEffect } from "react";

function bytesFromKey(key: string) {
  const pad = "=".repeat((4 - (key.length % 4)) % 4);
  const raw = atob(key.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function standalone() {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || Boolean(nav.standalone);
}

export async function enablePush(): Promise<string> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return "Этот браузер не умеет пуш";
  }
  if (!window.isSecureContext) return "Нужен https://www.videal-doc.ru — сейчас страница не защищена";
  const vapid = await fetch("/api/push/vapid").then((r) => r.json());
  if (!vapid.publicKey) return "На сервере ещё нет ключей пуша";
  const perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (perm !== "granted") return "Разрешение не выдано";
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: bytesFromKey(vapid.publicKey),
  });
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sub.toJSON()),
  });
  if (!res.ok) return "Не удалось сохранить подписку";
  return "ok";
}

export function PushSubscribe() {
  useEffect(() => {
    let stop = false;
    async function run() {
      if (!("Notification" in window) || !("serviceWorker" in navigator)) return;
      if (!window.isSecureContext) return;
      if (Notification.permission === "default" && standalone()) {
        await Notification.requestPermission();
      }
      if (Notification.permission !== "granted") return;
      if (stop) return;
      await enablePush().catch(() => {});
    }
    void run();
    return () => {
      stop = true;
    };
  }, []);
  return null;
}
