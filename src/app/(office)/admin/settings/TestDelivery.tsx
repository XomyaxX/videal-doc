"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Card, Field, Input } from "@/components/ui";
import { enablePush } from "@/components/PushSubscribe";

type Person = { id: string; label: string; hint: string };

export function TestDelivery({ people }: { people: Person[] }) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Person | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const [diag, setDiag] = useState("");
  const [server, setServer] = useState<{ subscriptions: number; vapid: boolean; people: { name: string; login: string }[] } | null>(
    null,
  );
  const [qr, setQr] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("ru");
    if (!q) return people.slice(0, 8);
    return people.filter((p) => `${p.label} ${p.hint}`.toLocaleLowerCase("ru").includes(q)).slice(0, 8);
  }, [people, query]);

  useEffect(() => {
    const https = window.location.protocol === "https:";
    const sw = "serviceWorker" in navigator;
    const perm = "Notification" in window ? Notification.permission : "нет API";
    const nav = navigator as Navigator & { standalone?: boolean };
    const stand = window.matchMedia("(display-mode: standalone)").matches || Boolean(nav.standalone);
    const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    setDiag(
      [
        https ? "HTTPS" : "HTTP — Safari напишет «Небезопасно», пуш не заработает",
        sw ? "service worker есть" : "нет service worker",
        `уведомления: ${perm}`,
        stand ? "открыто как приложение" : "вкладка браузера",
        ios ? "iPhone/iPad" : navigator.platform || "ПК",
      ].join(" · "),
    );
    void fetch("/api/admin/push-status")
      .then((r) => r.json())
      .then(setServer)
      .catch(() => {});
  }, []);

  async function test(userId?: string, urgency?: string) {
    setBusy(userId || urgency || "me");
    setMsg("");
    const res = await fetch("/api/admin/test-notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...(userId ? { userId } : {}), urgency: urgency || "normal" }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) {
      setMsg(data.error || "Не удалось");
      return;
    }
    setMsg(`${data.who}: колокольчик есть. Пуш: ${data.push}. Почта: ${data.mail}`);
    void fetch("/api/admin/push-status")
      .then((r) => r.json())
      .then(setServer)
      .catch(() => {});
  }

  async function smtp() {
    setBusy("smtp");
    setMsg("");
    const res = await fetch("/api/admin/test-smtp", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy("");
    setMsg(res.ok ? `Письмо ушло на ${data.to}` : data.error || "SMTP не отправил");
  }

  async function showQr() {
    setBusy("qr");
    const res = await fetch("/api/admin/test-qr");
    const data = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) setMsg(data.error || "Нет квадрата");
    else setQr(data.qr || "");
  }

  async function here() {
    setBusy("push");
    const out = await enablePush();
    setBusy("");
    setMsg(out === "ok" ? "Этот браузер подписан на пуш" : out);
    void fetch("/api/admin/push-status")
      .then((r) => r.json())
      .then(setServer)
      .catch(() => {});
  }

  return (
    <Card className="mb-6 max-w-lg space-y-4">
      <h2 className="font-serif text-xl text-navy">Проверка доставки</h2>
      <p className="text-sm text-muted">{diag}</p>
      <p className="text-sm text-muted">
        Подписок в базе: {server ? server.subscriptions : "…"}
        {server && !server.vapid ? " · нет VAPID на сервере" : ""}
        {server?.people?.length
          ? `. Кто может получить пуш: ${server.people.map((p) => p.name).join(", ")}`
          : ". Пока никто не разрешил уведомления на телефоне."}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={Boolean(busy)} onClick={() => void test()}>
          {busy === "me" ? "…" : "Тест мне"}
        </Button>
        <Button type="button" variant="gold" disabled={Boolean(busy)} onClick={() => void test(undefined, "urgent")}>
          {busy === "urgent" ? "…" : "Тест срочно"}
        </Button>
        <Button type="button" variant="secondary" disabled={Boolean(busy)} onClick={() => void here()}>
          {busy === "push" ? "…" : "Включить пуш здесь"}
        </Button>
        <Button type="button" variant="secondary" disabled={Boolean(busy)} onClick={() => void smtp()}>
          {busy === "smtp" ? "…" : "Тест SMTP"}
        </Button>
        <Button type="button" variant="secondary" disabled={Boolean(busy)} onClick={() => void showQr()}>
          {busy === "qr" ? "…" : "Квадрат 2FA"}
        </Button>
      </div>
      <Field label="Тест сотруднику" hint="Колокольчик всегда. Пуш — только если человек нажал «Загрузить» и разрешил уведомления.">
        <Input
          value={picked ? picked.label : query}
          placeholder="Фамилия"
          onChange={(e) => {
            setPicked(null);
            setQuery(e.target.value);
          }}
        />
      </Field>
      {!picked ? (
        <ul className="rounded-xl border border-line bg-white">
          {filtered.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-paper"
                onClick={() => {
                  setPicked(p);
                  setQuery(p.label);
                }}
              >
                {p.label}
                <span className="ml-2 text-muted">{p.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <Button type="button" disabled={Boolean(busy)} onClick={() => void test(picked.id)}>
          {busy === picked.id ? "…" : `Тест: ${picked.label}`}
        </Button>
      )}
      {qr ? (
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="QR входа" className="mx-auto rounded-xl border border-line bg-white p-2" />
          <p className="mt-2 text-center text-sm text-muted">
            Камера телефона должна открыть страницу подтверждения входа. Живой вход — с другого компьютера после пароля.
          </p>
        </div>
      ) : null}
      {msg ? <p className="text-sm text-navy">{msg}</p> : null}
    </Card>
  );
}
