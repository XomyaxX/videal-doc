"use client";

import { useState } from "react";
import { Button, Card } from "@/components/ui";

type Info = { name: string; mime: string; kind: string; v: number };

export function GateBgCard({ initial }: { initial: Info }) {
  const [info, setInfo] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [bad, setBad] = useState(false);
  const preview = info.kind ? `/api/admin/gate-bg/file?v=${info.v}` : "";

  async function upload(file: File | null) {
    if (!file) {
      setBad(true);
      setMsg("Выберите файл");
      return;
    }
    setBusy(true);
    setMsg("");
    const body = new FormData();
    body.set("file", file);
    const res = await fetch("/api/admin/gate-bg", { method: "POST", body });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setBad(true);
      setMsg(data.error || "Не удалось загрузить");
      return;
    }
    setInfo({ name: data.name || file.name, mime: data.mime || "", kind: data.kind || "", v: data.v || Date.now() });
    setBad(false);
    setMsg("Фон на телевизоре обновится в течение минуты.");
  }

  async function clear() {
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/admin/gate-bg", { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setBad(true);
      setMsg(data.error || "Не удалось убрать");
      return;
    }
    setInfo({ name: "", mime: "", kind: "", v: 0 });
    setBad(false);
    setMsg("Фон убран. На телевизоре останется тёмный экран и QR справа.");
  }

  return (
    <Card className="mb-6 max-w-lg space-y-3">
      <h2 className="font-serif text-xl text-navy">Фон экрана на входе</h2>
      <p className="text-sm text-muted">
        Картинка, GIF или видео на весь экран телевизора. QR остаётся справа. Звук выключен, ролик крутится по кругу.
        Подойдут MP4, WEBM, MOV, GIF, JPG, PNG и WEBP, до 512 МБ. Адрес экрана для пульта: http://192.168.1.51/qr.
      </p>
      {info.name ? <p className="text-sm text-navy">Сейчас: {info.name}</p> : <p className="text-sm text-muted">Фон ещё не загружен.</p>}
      {preview && info.kind === "image" ? (
        <img src={preview} alt="" className="h-40 w-full rounded-xl object-cover" />
      ) : null}
      {preview && info.kind === "video" ? (
        <video src={preview} className="h-40 w-full rounded-xl object-cover" muted controls playsInline />
      ) : null}
      <input
        type="file"
        accept="video/mp4,video/webm,video/quicktime,image/gif,image/jpeg,image/png,image/webp,image/avif,.mp4,.webm,.mov,.m4v,.ogv,.gif,.jpg,.jpeg,.png,.webp,.avif"
        disabled={busy}
        onChange={(e) => void upload(e.target.files?.[0] || null)}
        className="block w-full text-sm"
      />
      {info.name ? (
        <Button type="button" variant="secondary" disabled={busy} onClick={() => void clear()}>
          {busy ? "…" : "Убрать фон"}
        </Button>
      ) : null}
      {msg ? <p className={`text-sm ${bad ? "text-bad" : "text-ok"}`}>{msg}</p> : null}
    </Card>
  );
}
